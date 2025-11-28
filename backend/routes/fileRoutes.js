const express = require("express");
const router = express.Router();
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { cloudinary } = require("../config/cloudinary");
const File = require("../models/File");
const Note = require("../models/Note"); // ✅ Notes model
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const auth = require("../middleware/auth");
const fetch = require("node-fetch");
const { askAI, askAIJson } = require("../utils/aiClient");

const MAX_FAST_CHARS = parseInt(process.env.SUMMARY_MAX_CHARS || "16000", 10);

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ========= FILE UPLOAD ========= */
router.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // Choose resource_type and apply server-side transformations for images
    const isImage = (req.file.mimetype || '').startsWith('image/');

    const options = isImage ? {
      resource_type: 'image',
      folder: 'paperly_uploads',
      use_filename: true,
      unique_filename: true,
      transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
      quality: 'auto:good',
      fetch_format: 'auto'
    } : {
      resource_type: 'raw',
      folder: 'paperly_uploads',
      use_filename: true,
      unique_filename: true
    };

    const uploadRes = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
      stream.end(req.file.buffer);
    });

    const newFile = new File({
      name: req.file.originalname,
      fileUrl: uploadRes.secure_url,
      uploadedBy: req.user.id,
      size: req.file.size,
      type: req.file.mimetype,
    });

    await newFile.save();

    console.log("✅ Cloudinary upload success:", uploadRes.secure_url);

    res.status(201).json({
      message: "✅ File uploaded successfully",
      fileUrl: uploadRes.secure_url,
      content: newFile,
    });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({ message: "Server error during file upload" });
  }
});

/* ========= NOTES CRUD ========= */
// ➕ Create Note
router.post("/notes", auth, async (req, res) => {
  try {
    const { title, type, content, tags, fileUrl } = req.body;

    const note = new Note({
      title,
      type,
      content,
      tags,
      fileUrl: fileUrl || null,
      uploadedBy: req.user.id,
    });

    await note.save();
    await note.populate("uploadedBy", "name avatar");
    res.status(201).json(note);
  } catch (error) {
    console.error("❌ Create Note error:", error);
    res.status(500).json({ message: "Error creating note" });
  }
});

// 📂 Get All Notes (visible to all authenticated users)
router.get("/notes", auth, async (req, res) => {
  try {
    const notes = await Note.find({})
      .populate("uploadedBy", "name avatar")
      .sort({ date: -1 });
    res.json(notes);
  } catch (error) {
    console.error("❌ Fetch Notes error:", error);
    res.status(500).json({ message: "Error fetching notes" });
  }
});

// ✏️ Update Note
router.put("/notes/:id", auth, async (req, res) => {
  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, uploadedBy: req.user.id },
      req.body,
      { new: true }
    );
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json(note);
  } catch (error) {
    console.error("❌ Update Note error:", error);
    res.status(500).json({ message: "Error updating note" });
  }
});

// 🗑️ Delete Note
router.delete("/notes/:id", auth, async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({ _id: req.params.id, uploadedBy: req.user.id });
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json({ message: "Note deleted" });
  } catch (error) {
    console.error("❌ Delete Note error:", error);
    res.status(500).json({ message: "Error deleting note" });
  }
});

/* ========= GENERIC FILE SERVING WITH ACCESS CONTROL ========= */
// Serves any file with proper headers and access control
router.get("/serve", auth, async (req, res) => {
  try {
    const { url, messageId } = req.query;
    if (!url) return res.status(400).json({ message: "Missing file URL parameter" });
    if (!messageId) return res.status(400).json({ message: "Missing message ID parameter" });

    // Validate URL
    let fileUrl;
    try { 
      fileUrl = new URL(url); 
    } catch (_) { 
      console.error(`❌ Invalid URL provided: ${url}`);
      return res.status(400).json({ message: "Invalid file URL" }); 
    }
    if (!/^https?:$/.test(fileUrl.protocol)) {
      return res.status(400).json({ message: "Unsupported URL protocol" });
    }

    // Check if user has access to this file by verifying they are either sender or receiver
    const message = await Message.findById(messageId);
    if (!message) {
      console.error(`❌ Message not found: ${messageId}`);
      return res.status(404).json({ message: "Message not found" });
    }

    // Check if current user is either sender or receiver of the message
    const currentUserId = req.user.id;
    if (message.senderId.toString() !== currentUserId && message.receiverId.toString() !== currentUserId) {
      console.error(`❌ Access denied for user ${currentUserId} to message ${messageId}`);
      return res.status(403).json({ message: "Access denied" });
    }

    console.log(`📁 Serving file: ${message.fileName || 'Unknown'} (${message.mimeType || 'unknown type'}) for message ${messageId}`);

    // Fetch the file from Cloudinary
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      console.error(`❌ File Proxy Fetch Failed: ${response.status} ${response.statusText} for URL: ${url}`);
      return res.status(502).json({ message: "Failed to fetch file from storage" });
    }

    // Use MIME type from database (more reliable than Cloudinary headers)
    const contentType = message.mimeType || response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader("Content-Type", contentType);
    
    // Set Content-Length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    
    // For inline viewing of common document types
    const inlineTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'text/plain',
      'text/html'
    ];
    
    if (inlineTypes.includes(contentType) || contentType.startsWith('image/')) {
      res.setHeader("Content-Disposition", 'inline');
    } else {
      // For other types, suggest download
      const fileName = message.fileName || 'file';
      const safeFileName = fileName.replace(/[^\w\s.-]/g, '_'); // Sanitize filename
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
    }

    // Add cache control for better performance
    res.setHeader("Cache-Control", "private, max-age=3600");

    console.log(`✅ Successfully serving file: ${message.fileName || 'Unknown'}`);
    response.body.pipe(res);
  } catch (error) {
    console.error("❌ File serve error:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error serving file" });
  }
});

/* ========= PDF INLINE PROXY ========= */
// Serves a remote PDF inline with proper headers to avoid download prompts
router.get("/pdf", auth, async (req, res) => {
  try {
    const src = req.query.src;
    if (!src) return res.status(400).json({ message: "Missing src parameter" });
    let url;
    try { url = new URL(src); } catch (_) { return res.status(400).json({ message: "Invalid src URL" }); }
    if (!/^https?:$/.test(url.protocol)) {
      return res.status(400).json({ message: "Unsupported URL protocol" });
    }

    const response = await fetch(src);
    if (!response.ok || !response.body) {
      console.error(`❌ PDF Proxy Fetch Failed: ${response.status} ${response.statusText} for URL: ${src}`);
      return res.status(502).json({ message: "Failed to fetch PDF" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');

    response.body.pipe(res);
  } catch (error) {
    console.error("❌ PDF proxy error:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error proxying PDF" });
  }
});

/* ========= PDF + AI HELPERS ========= */
async function extractPdfText(fileUrl) {
  try {
    console.log(`Fetching PDF from: ${fileUrl}`);
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`PDF buffer size: ${buffer.length} bytes`);
    
    // pdf-parse may emit "TT: undefined function" warnings for certain PDF encodings
    // These are usually harmless but indicate non-standard PDF features
    const data = await pdfParse(buffer, {
      // Increase max page parsing to avoid truncation
      max: 0,
    });
    
    console.log(`✓ PDF parsed: ${data.numpages} pages, ${data.text.length} chars`);
    return data.text;
  } catch (err) {
    console.error(`✗ PDF extraction failed for ${fileUrl}:`, err.message);
    throw err;
  }
}


/* ========= Helpers: chunk + merge ========= */
function chunkTextByParagraphs(text, maxChars = 6000) {
  const paras = text.split(/\n\s*\n/);
  const chunks = [];
  let current = "";
  for (const p of paras) {
    // If a single paragraph is huge, hard-split it
    if (p.length > maxChars) {
      const hard = p.match(new RegExp(`.{1,${maxChars}}`, 'g')) || [];
      for (const h of hard) {
        if (current) { chunks.push(current); current = ""; }
        chunks.push(h);
      }
      continue;
    }
    if ((current + "\n\n" + p).length > maxChars) {
      if (current) chunks.push(current);
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function parseList(raw) {
  if (!raw) return [];
  return raw
    .split(/\n|\r/)
    .map((p) => p.replace(/^[\s\-−–—•*\d.\)]+/, "").trim())
    .filter(Boolean);
}

async function summarizeLarge(text) {
  // Fast path: if text is within limit, single call returning all fields
  if (text.length <= MAX_FAST_CHARS) {
    // Try JSON-structured response first (Gemini primary, Groq fallback)
    const json = await askAIJson(
      `Summarize the following PDF content. Return ONLY a strict JSON object with keys: \n` +
      `- overview: string (200-350 words, clear headings, short paragraphs)\n` +
      `- key_points: array of up to 5 short one-sentence points\n` +
      `- highlights: array of up to 3 phrases (<= 15 words each)\n\n` +
      `Text:\n` + text
    );
    if (json && (json.overview || json.key_points || json.highlights)) {
      return {
        overview: json.overview || "",
        key_points: Array.isArray(json.key_points) ? json.key_points : [],
        highlights: Array.isArray(json.highlights) ? json.highlights : [],
      };
    }

    // Robust fallback: compute overview, key points, and highlights separately
    const [overviewOnly, keyPointsRaw, highlightsRaw] = await Promise.all([
      askAI(
        `Provide a concise overview (200-350 words) with clear headings and short paragraphs for this PDF text.\n\n${text}`
      ),
      askAI(
        `List the 3-5 most important bullet-point key points from this PDF. Use one short sentence per point.\n\n${text}`
      ),
      askAI(
        `Extract the top 2-3 short highlight phrases (<= 15 words each) that are most actionable or high-impact from this PDF.\n\n${text}`
      ),
    ]);

    const key_points = parseList(keyPointsRaw)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);

    const highlights = parseList(highlightsRaw)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    return { overview: overviewOnly || "", key_points, highlights };
  }

  // Otherwise: chunk + parallelize to speed up
  const chunks = chunkTextByParagraphs(text, 6000);

  // Overview partials in parallel
  const partialOverviews = (await Promise.all(
    chunks.map((c) => askAI(
      `Provide a concise overview (120-180 words) for this part of a PDF. Avoid repetition across sections.\n\n${c}`
    ))
  )).filter(Boolean);

  // Merge into final overview + also ask to produce key points & highlights in the same pass
  const mergedJson = await askAIJson(
    `You will receive multiple partial overviews of a single PDF. Merge them into a single, cohesive summary and also extract key points and highlights.\n` +
    `Return ONLY a strict JSON object with keys: \n` +
    `- overview: string (220-380 words, clear headings, short paragraphs)\n` +
    `- key_points: array of up to 5 short one-sentence points\n` +
    `- highlights: array of up to 3 phrases (<= 15 words each)\n\n` +
    partialOverviews.map((o, i) => `Part ${i + 1}:\n${o}`).join("\n\n")
  );

  if (mergedJson && (mergedJson.overview || mergedJson.key_points || mergedJson.highlights)) {
    return {
      overview: mergedJson.overview || "",
      key_points: Array.isArray(mergedJson.key_points) ? mergedJson.key_points : [],
      highlights: Array.isArray(mergedJson.highlights) ? mergedJson.highlights : [],
    };
  }

  // As a last resort, compute key points and highlights in parallel across chunks
  const [keyPointsByChunk, highlightsByChunk] = await Promise.all([
    Promise.all(chunks.map((c) => askAI(`List the 3-5 most important bullet-point key points from this text. Use one short sentence per point.\n\n${c}`))),
    Promise.all(chunks.map((c) => askAI(`Extract the top 2 short highlights (<= 15 words each) that are actionable or high-impact.\n\n${c}`))),
  ]);

  const partialKeyPoints = keyPointsByChunk.flatMap(parseList);
  const key_points = Array.from(new Set(partialKeyPoints.map((s) => s.toLowerCase())))
    .slice(0, 5)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));

  const partialHighlights = highlightsByChunk.flatMap(parseList);
  const highlights = Array.from(new Set(partialHighlights.map((s) => s.toLowerCase())))
    .slice(0, 3)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));

  // Fallback overview merge text-only
  const overview = await askAI(
    'Merge the following partial overviews into a single, cohesive summary (200-350 words) with clear headings and short paragraphs. Avoid duplication, keep key ideas only.\n\n' +
    partialOverviews.map((o, i) => `Part ${i + 1}:\n${o}`).join("\n\n")
  );

  return { overview, key_points, highlights };
}

/* ========= ANALYZE PDF ========= */
router.post("/analyze-pdf-url", auth, async (req, res) => {
  try {
    const { fileUrl } = req.body;
    if (!fileUrl) return res.status(400).json({ message: "Missing fileUrl" });

    const text = await extractPdfText(fileUrl);
    if (!text) return res.status(400).json({ message: "Could not extract text" });

    const { overview, key_points, highlights } = await summarizeLarge(text);

    res.json({ overview, key_points, highlights });
  } catch (error) {
    console.error("❌ Analyze-pdf-url error:", error);
    res.status(500).json({ message: "Error analyzing PDF", error: error.message });
  }
});

// ========= Key Points Only =========
router.post("/analyze-key-points", auth, async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const text = await extractPdfText(fileUrl);

    // Fast path: single call
    if (text.length <= MAX_FAST_CHARS) {
      const json = await askAIJson(
        `Extract ONLY key points from the following text. Return a strict JSON object: { "key_points": string[] } with up to 5 short one-sentence points.\n\n${text}`
      );
      if (json && Array.isArray(json.key_points)) return res.json({ key_points: json.key_points.slice(0, 5) });
    }

    // Parallelize across chunks
    const chunks = chunkTextByParagraphs(text, 6000);
    const collectedRaw = await Promise.all(
      chunks.map((c) => askAI(`Extract the 3-5 most important key points from this text, one sentence each.\n\n${c}`))
    );
    const collected = collectedRaw.flatMap(parseList);
    const key_points = Array.from(new Set(collected.map((s) => s.toLowerCase())))
      .slice(0, 5)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    res.json({ key_points });
  } catch (error) {
    console.error("❌ Key points error:", error);
    res.status(500).json({ message: "Error extracting key points", error: error.message });
  }
});

// ========= Highlights Only =========
router.post("/analyze-highlights", auth, async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const text = await extractPdfText(fileUrl);

    // Fast path: single call
    if (text.length <= MAX_FAST_CHARS) {
      const json = await askAIJson(
        `Extract ONLY highlights from the following text. Return a strict JSON object: { "highlights": string[] } with up to 3 phrases (<= 15 words each).\n\n${text}`
      );
      if (json && Array.isArray(json.highlights)) return res.json({ highlights: json.highlights.slice(0, 3) });
    }

    // Parallelize across chunks
    const chunks = chunkTextByParagraphs(text, 6000);
    const collectedRaw = await Promise.all(
      chunks.map((c) => askAI(`Extract 2 short highlights (<= 15 words each) that are actionable or high-impact.\n\n${c}`))
    );
    const collected = collectedRaw.flatMap(parseList);
    const highlights = Array.from(new Set(collected.map((s) => s.toLowerCase())))
      .slice(0, 3)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    res.json({ highlights });
  } catch (error) {
    console.error("❌ Highlights error:", error);
    res.status(500).json({ message: "Error extracting highlights", error: error.message });
  }
});

module.exports = router;
