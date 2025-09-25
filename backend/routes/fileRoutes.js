const express = require("express");
const router = express.Router();
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cloudinary = require("../config/cloudinary");
const File = require("../models/File");
const Note = require("../models/Note"); // ✅ Notes model
const auth = require("../middleware/auth");
const OpenAI = require("openai");
const fetch = require("node-fetch");

// ✅ Groq Client
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
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
  const response = await fetch(fileUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  const data = await pdfParse(buffer);
  return data.text;
}

async function askAI(prompt) {
  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a precise assistant. Keep outputs concise, structured, and faithful to the input." },
        { role: "user", content: prompt },
      ],
    });
    return completion.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("❌ askAI error:", err?.response?.data || err.message || err);
    return "";
  }
}

// Prefer single-call fast path that returns strict JSON
async function askAIJson(prompt) {
  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a precise assistant. Always return a strict JSON object with only the requested keys. No prose." },
        { role: "user", content: prompt },
      ],
      // Some Groq models honor JSON-style outputs without explicit response_format; keep prompt-enforced parsing.
    });
    const content = completion.choices?.[0]?.message?.content?.trim() || "";
    try {
      return JSON.parse(content);
    } catch (_) {
      // Try to salvage JSON inside fenced code blocks
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]); } catch (_) {}
      }
      throw new Error("Non-JSON response");
    }
  } catch (err) {
    console.error("❌ askAIJson error:", err?.response?.data || err.message || err);
    return null;
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
    // Fallback to simple overview if JSON parsing fails
    const overviewOnly = await askAI(
      `Provide a concise overview (200-350 words) with clear headings and short paragraphs for this PDF text.\n\n${text}`
    );
    return { overview: overviewOnly, key_points: [], highlights: [] };
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
    `Merge the following partial overviews into a single, cohesive summary (200-350 words) with clear headings and short paragraphs. Avoid duplication, keep key ideas only.\n\n${partialOverviews.map((o, i) => `Part ${i + 1}:\n${o}`).join("\n\n")}`
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
