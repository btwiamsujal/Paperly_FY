import fs from "fs";
import pdfParse from "pdf-parse";
import OpenAI from "openai";
import File from "../models/File.js";
import { v2 as cloudinary } from "cloudinary";

// ✅ Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Groq client
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- helper: upload buffer to Cloudinary ---
const uploadBufferToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "paperly_uploads",
        resource_type: "raw", // ✅ ensures PDFs are tracked in Cloudinary RAW storage
        public_id: file.originalname.split(".")[0],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(file.buffer);
  });
};

// ========== Upload File ==========
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // ✅ Upload to Cloudinary and wait
    const result = await uploadBufferToCloudinary(req.file);

    // Debug logs for Cloudinary response
    console.log("✅ Cloudinary upload success:", {
      url: result.secure_url,
      resource_type: result.resource_type,
      bytes: result.bytes,
      format: result.format,
    });

    // Save metadata in MongoDB
    const fileDoc = await File.create({
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: result.secure_url, // Cloudinary URL
      classroomId: req.params.classroomId,
    });

    res.json({
      success: true,
      content: { fileId: fileDoc._id, fileUrl: result.secure_url },
    });
  } catch (err) {
    console.error("❌ Error uploading file:", err);
    res.status(500).json({ error: "Error uploading file" });
  }
};

// ========== Get Files ==========
export const getFiles = async (req, res) => {
  try {
    const files = await File.find({ classroomId: req.params.classroomId });
    res.json(files);
  } catch (err) {
    console.error("❌ Error fetching files:", err);
    res.status(500).json({ error: "Error fetching files" });
  }
};

// ========== Analyze PDF ==========
export const analyzePdf = async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.fileId);
    if (!fileDoc) return res.status(404).json({ error: "File not found" });

    // ✅ Always fetch from Cloudinary if URL present
    let pdfBuffer;
    if (fileDoc.path.startsWith("http")) {
      console.log(`Fetching PDF from: ${fileDoc.path}`);
      const response = await fetch(fileDoc.path);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      pdfBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      pdfBuffer = fs.readFileSync(fileDoc.path);
    }

    console.log(`PDF buffer size: ${pdfBuffer.length} bytes`);
    // Note: pdf-parse may show "TT: undefined function" warnings for certain PDF encodings.
    // These are typically harmless warnings from the underlying PDF.js library.
    const data = await pdfParse(pdfBuffer, { max: 0 });

    const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
    const MAX_CHARS = parseInt(process.env.SUMMARY_MAX_CHARS || "16000", 10);
    const pdfText = (data.text || "").trim();
    if (!pdfText) return res.status(400).json({ error: "No text found in PDF" });

    const textToSend = pdfText.length > MAX_CHARS ? pdfText.slice(0, MAX_CHARS) : pdfText;

    // ✅ Send to Groq for summarization
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes PDF text." },
        {
          role: "user",
          content: `Summarize the following PDF text in a well-structured format with:
- Clear headings
- Bullet points
- Key highlights
- Case studies
- Proper separation of sections

Text:\n\n${textToSend}`,
        },
      ],
    });

    const summaryText = completion.choices[0].message.content;

    res.json({
      document: fileDoc.originalname,
      length: pdfText.length,
      overview: summaryText,
    });
  } catch (err) {
    console.error("❌ Error analyzing PDF:", err);
    res.status(500).json({ error: "Error analyzing PDF" });
  }
};
