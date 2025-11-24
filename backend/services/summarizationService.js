const AISummary = require('../models/AISummary');
const { askAI, askAIJson } = require('../utils/aiClient');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');

const MAX_FAST_CHARS = parseInt(process.env.SUMMARY_MAX_CHARS || '16000', 10);
const CHUNK_SIZE = parseInt(process.env.SUMMARY_CHUNK_SIZE || '6000', 10);
const MAX_CONCURRENT = parseInt(process.env.SUMMARY_MAX_CONCURRENT_CHUNKS || '5', 10);
const TIMEOUT_MS = parseInt(process.env.SUMMARY_TIMEOUT_MS || '30000', 10);

/**
 * Extract text from PDF URL
 */
async function extractPdfText(fileUrl) {
  try {
    console.log(`📄 Fetching PDF from: ${fileUrl}`);
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`📦 PDF buffer size: ${buffer.length} bytes`);
    
    const data = await pdfParse(buffer, { max: 0 });
    
    console.log(`✓ PDF parsed: ${data.numpages} pages, ${data.text.length} chars`);
    return data.text;
  } catch (err) {
    console.error(`✗ PDF extraction failed for ${fileUrl}:`, err.message);
    throw err;
  }
}

/**
 * Chunk text by paragraphs, respecting maxChars limit
 */
function chunkTextByParagraphs(text, maxChars = CHUNK_SIZE) {
  const paras = text.split(/\n\s*\n/);
  const chunks = [];
  let current = '';
  
  for (const p of paras) {
    // If a single paragraph is huge, hard-split it
    if (p.length > maxChars) {
      const hard = p.match(new RegExp(`.{1,${maxChars}}`, 'g')) || [];
      for (const h of hard) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        chunks.push(h);
      }
      continue;
    }
    
    if ((current + '\n\n' + p).length > maxChars) {
      if (current) chunks.push(current);
      current = p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Parse list from AI response (handles various formats)
 */
function parseList(raw) {
  if (!raw) return [];
  return raw
    .split(/\n|\r/)
    .map((p) => p.replace(/^[\s\-−–—•*\d.\)]+/, '').trim())
    .filter(Boolean);
}

/**
 * Process chunks in parallel with concurrency limit
 */
async function processChunksInParallel(chunks, processFn, maxConcurrent = MAX_CONCURRENT) {
  const results = [];
  
  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(batch.map(processFn));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Summarize text with chunking and parallel processing
 */
async function summarizeText(text) {
  const startTime = Date.now();
  
  // Fast path: if text is within limit, single call
  if (text.length <= MAX_FAST_CHARS) {
    console.log(`📝 Fast path: text is ${text.length} chars, using single call`);
    
    // Try JSON-structured response first
    const json = await askAIJson(
      `Summarize the following PDF content. Return ONLY a strict JSON object with keys:\n` +
      `- overview: string (200-350 words, clear headings, short paragraphs)\n` +
      `- key_points: array of up to 5 short one-sentence points\n` +
      `- highlights: array of up to 3 phrases (<= 15 words each)\n\n` +
      `Text:\n${text}`
    );
    
    if (json && (json.overview || json.key_points || json.highlights)) {
      const processingTime = Date.now() - startTime;
      return {
        overview: json.overview || '',
        key_points: Array.isArray(json.key_points) ? json.key_points : [],
        highlights: Array.isArray(json.highlights) ? json.highlights : [],
        processingTime,
        chunkCount: 1,
        totalChars: text.length
      };
    }
    
    // Fallback: compute separately
    console.log(`⚠ JSON parsing failed, using fallback method`);
    const [overviewOnly, keyPointsRaw, highlightsRaw] = await Promise.all([
      askAI(`Provide a concise overview (200-350 words) with clear headings and short paragraphs for this PDF text.\n\n${text}`),
      askAI(`List the 3-5 most important bullet-point key points from this PDF. Use one short sentence per point.\n\n${text}`),
      askAI(`Extract the top 2-3 short highlight phrases (<= 15 words each) that are most actionable or high-impact from this PDF.\n\n${text}`)
    ]);
    
    const processingTime = Date.now() - startTime;
    return {
      overview: overviewOnly || '',
      key_points: parseList(keyPointsRaw).slice(0, 5),
      highlights: parseList(highlightsRaw).slice(0, 3),
      processingTime,
      chunkCount: 1,
      totalChars: text.length
    };
  }
  
  // Chunked path: split and process in parallel
  console.log(`📚 Chunked path: text is ${text.length} chars, splitting into chunks`);
  const chunks = chunkTextByParagraphs(text, CHUNK_SIZE);
  console.log(`✂ Created ${chunks.length} chunks`);
  
  // Process overview chunks in parallel
  const partialOverviews = await processChunksInParallel(
    chunks,
    (chunk) => askAI(
      `Provide a concise overview (120-180 words) for this part of a PDF. Avoid repetition across sections.\n\n${chunk}`
    ),
    MAX_CONCURRENT
  );
  
  const validOverviews = partialOverviews.filter(Boolean);
  console.log(`✓ Generated ${validOverviews.length} partial overviews`);
  
  // Merge into final summary with key points and highlights
  const mergedJson = await askAIJson(
    `You will receive multiple partial overviews of a single PDF. Merge them into a single, cohesive summary and also extract key points and highlights.\n` +
    `Return ONLY a strict JSON object with keys:\n` +
    `- overview: string (220-380 words, clear headings, short paragraphs)\n` +
    `- key_points: array of up to 5 short one-sentence points\n` +
    `- highlights: array of up to 3 phrases (<= 15 words each)\n\n` +
    validOverviews.map((o, i) => `Part ${i + 1}:\n${o}`).join('\n\n')
  );
  
  if (mergedJson && (mergedJson.overview || mergedJson.key_points || mergedJson.highlights)) {
    const processingTime = Date.now() - startTime;
    return {
      overview: mergedJson.overview || '',
      key_points: Array.isArray(mergedJson.key_points) ? mergedJson.key_points : [],
      highlights: Array.isArray(mergedJson.highlights) ? mergedJson.highlights : [],
      processingTime,
      chunkCount: chunks.length,
      totalChars: text.length
    };
  }
  
  // Last resort: compute key points and highlights separately
  console.log(`⚠ Merged JSON parsing failed, computing key points and highlights separately`);
  const [keyPointsByChunk, highlightsByChunk] = await Promise.all([
    processChunksInParallel(
      chunks,
      (chunk) => askAI(`List the 3-5 most important bullet-point key points from this text. Use one short sentence per point.\n\n${chunk}`),
      MAX_CONCURRENT
    ),
    processChunksInParallel(
      chunks,
      (chunk) => askAI(`Extract the top 2 short highlights (<= 15 words each) that are actionable or high-impact.\n\n${chunk}`),
      MAX_CONCURRENT
    )
  ]);
  
  const partialKeyPoints = keyPointsByChunk.flatMap(parseList);
  const key_points = Array.from(new Set(partialKeyPoints.map((s) => s.toLowerCase())))
    .slice(0, 5)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  
  const partialHighlights = highlightsByChunk.flatMap(parseList);
  const highlights = Array.from(new Set(partialHighlights.map((s) => s.toLowerCase())))
    .slice(0, 3)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  
  // Merge overviews
  const overview = await askAI(
    `Merge the following partial overviews into a single, cohesive summary (200-350 words) with clear headings and short paragraphs. Avoid duplication, keep key ideas only.\n\n${validOverviews.map((o, i) => `Part ${i + 1}:\n${o}`).join('\n\n')}`
  );
  
  const processingTime = Date.now() - startTime;
  return {
    overview,
    key_points,
    highlights,
    processingTime,
    chunkCount: chunks.length,
    totalChars: text.length
  };
}

/**
 * Main service function: Process a summary request
 * This runs asynchronously after creating the summary record
 */
async function processSummaryRequest(summaryId, fileUrl, userId) {
  const startTime = Date.now();
  
  try {
    console.log(`🚀 Starting summarization for ${summaryId}`);
    
    // Update status to IN_PROGRESS
    await AISummary.findByIdAndUpdate(summaryId, {
      status: 'IN_PROGRESS',
      updatedAt: Date.now()
    });
    
    // Extract PDF text
    const text = await extractPdfText(fileUrl);
    if (!text || text.trim().length === 0) {
      throw new Error('No text could be extracted from the PDF');
    }
    
    // Summarize with timeout
    const summaryPromise = summarizeText(text);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Summarization timeout')), TIMEOUT_MS)
    );
    
    const result = await Promise.race([summaryPromise, timeoutPromise]);
    
    // Determine which model was used (from environment)
    const modelUsed = process.env.AI_PROVIDER || 'gemini';
    
    // Update summary with results
    await AISummary.findByIdAndUpdate(summaryId, {
      status: 'COMPLETED',
      summary: {
        overview: result.overview,
        key_points: result.key_points,
        highlights: result.highlights
      },
      processingTime: Date.now() - startTime,
      metadata: {
        chunkCount: result.chunkCount,
        modelUsed: modelUsed,
        totalChars: result.totalChars
      },
      updatedAt: Date.now()
    });
    
    console.log(`✅ Summarization completed for ${summaryId} in ${Date.now() - startTime}ms`);
    
  } catch (error) {
    console.error(`❌ Summarization failed for ${summaryId}:`, error.message);
    
    // Update summary with error
    await AISummary.findByIdAndUpdate(summaryId, {
      status: 'FAILED',
      errorMessage: error.message || 'Unknown error occurred',
      updatedAt: Date.now()
    });
  }
}

module.exports = {
  processSummaryRequest,
  extractPdfText,
  summarizeText
};
