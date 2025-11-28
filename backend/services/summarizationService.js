const AISummary = require('../models/AISummary');
const aiClient = require('../utils/aiClient');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');

const MAX_FAST_CHARS = parseInt(process.env.SUMMARY_MAX_CHARS || '16000', 10);
const CHUNK_SIZE = parseInt(process.env.SUMMARY_CHUNK_SIZE || '6000', 10);
const MAX_CONCURRENT = parseInt(process.env.SUMMARY_MAX_CONCURRENT_CHUNKS || '5', 10);
const TIMEOUT_MS = parseInt(process.env.SUMMARY_TIMEOUT_MS || '30000', 10);

/**
 * Extract text from PDF URL
 */
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
 * Extract text from various sources
 */
async function extractText(sourceType, source) {
  if (sourceType === 'pdf') {
    return await extractPdfText(source);
  } else if (sourceType === 'text') {
    return source;
  } else if (sourceType === 'note') {
    // Assuming source is note content or ID. If ID, we'd need to fetch it.
    // For now, assuming the controller passes the actual note content as 'source' 
    // or handles the fetching. Let's assume 'source' is the text content.
    return source; 
  }
  throw new Error(`Unsupported source type: ${sourceType}`);
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
/**
 * Summarize text with chunking and parallel processing
 * Returns a structured object with summary, bulletPoints, wordCount, sourceType, warnings
 */
async function summarizeText(text, options = {}) {
  const startTime = Date.now();
  const { sourceType = 'unknown', summaryLength = 'medium', focus = 'general' } = options;
  
  // Fast path: if text is within limit, single call
  if (text.length <= MAX_FAST_CHARS) {
    console.log(`📝 Fast path: text is ${text.length} chars, using single call`);
    
    const prompt = `Summarize the following text. 
    Source Type: ${sourceType}
    Length: ${summaryLength}
    Focus: ${focus}
    
    Return ONLY a strict JSON object with keys:
    - summary: string (The main summary text, structured with paragraphs)
    - bulletPoints: array of strings (Key points)
    - highlights: array of strings (Short highlight phrases, <= 15 words each)
    - warnings: array of strings (Any issues like low quality text, optional)
    
    Text:
    ${text}`;

    // Try JSON-structured response first
    const json = await aiClient.askAIJson(prompt);
    
    if (json && (json.summary || json.bulletPoints)) {
      const processingTime = Date.now() - startTime;
      return {
        summary: json.summary || '',
        bulletPoints: Array.isArray(json.bulletPoints) ? json.bulletPoints : [],
        wordCount: (json.summary || '').split(/\s+/).length,
        sourceType,
        warnings: json.warnings || [],
        processingTime,
        chunkCount: 1,
        totalChars: text.length,
        // Legacy fields for backward compatibility
        overview: json.summary || '',
        key_points: Array.isArray(json.bulletPoints) ? json.bulletPoints : [],
        highlights: Array.isArray(json.highlights) ? json.highlights : [] 
      };
    }
    
    // Fallback: compute separately (simplified for brevity, can be expanded if needed)
    console.log(`⚠ JSON parsing failed, using fallback method`);
    const summaryRaw = await aiClient.askAI(`Summarize this text (${summaryLength}, focus: ${focus}):\n\n${text}`);
    const bulletsRaw = await aiClient.askAI(`List key points for this text:\n\n${text}`);
    
    const processingTime = Date.now() - startTime;
    return {
      summary: summaryRaw || '',
      bulletPoints: parseList(bulletsRaw),
      wordCount: (summaryRaw || '').split(/\s+/).length,
      sourceType,
      warnings: [],
      processingTime,
      chunkCount: 1,
      totalChars: text.length,
      // Legacy
      overview: summaryRaw || '',
      key_points: parseList(bulletsRaw),
      highlights: [] // Fallback highlights not implemented for brevity
    };
  }
  
  // Chunked path: split and process in parallel
  console.log(`📚 Chunked path: text is ${text.length} chars, splitting into chunks`);
  const chunks = chunkTextByParagraphs(text, CHUNK_SIZE);
  console.log(`✂ Created ${chunks.length} chunks`);
  
  // Process overview chunks in parallel
  const partialOverviews = await processChunksInParallel(
    chunks,
    (chunk) => aiClient.askAI(
      `Provide a concise overview for this part of the text. Avoid repetition.\n\n${chunk}`
    ),
    MAX_CONCURRENT
  );
  
  const validOverviews = partialOverviews.filter(Boolean);
  
  // Merge into final summary
  const mergedJson = await aiClient.askAIJson(
    `Merge these partial summaries into a single cohesive summary.
    Source Type: ${sourceType}
    Length: ${summaryLength}
    Focus: ${focus}
    
    Return ONLY a strict JSON object with keys:
    - summary: string
    - bulletPoints: array of strings
    - highlights: array of strings
    
    Partials:
    ${validOverviews.map((o, i) => `Part ${i + 1}:\n${o}`).join('\n\n')}`
  );
  
  if (mergedJson && (mergedJson.summary || mergedJson.bulletPoints)) {
     const processingTime = Date.now() - startTime;
     return {
        summary: mergedJson.summary || '',
        bulletPoints: Array.isArray(mergedJson.bulletPoints) ? mergedJson.bulletPoints : [],
        wordCount: (mergedJson.summary || '').split(/\s+/).length,
        sourceType,
        warnings: [],
        processingTime,
        chunkCount: chunks.length,
        totalChars: text.length,
        // Legacy
        overview: mergedJson.summary || '',
        key_points: Array.isArray(mergedJson.bulletPoints) ? mergedJson.bulletPoints : [],
        highlights: Array.isArray(mergedJson.highlights) ? mergedJson.highlights : []
     };
  }

  // Fallback merge
  const finalSummary = await aiClient.askAI(`Merge these summaries:\n\n${validOverviews.join('\n\n')}`);
  
  return {
    summary: finalSummary,
    bulletPoints: [],
    wordCount: finalSummary.split(/\s+/).length,
    sourceType,
    warnings: ['Complex merge, some details may be lost'],
    processingTime: Date.now() - startTime,
    chunkCount: chunks.length,
    totalChars: text.length,
    // Legacy
    overview: finalSummary,
    key_points: [],
    highlights: []
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
  summarizeText,
  extractText
};
