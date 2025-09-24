const ClassroomContent = require('../models/ClassroomContent'); 
const OpenAI = require("openai");

// --- Groq Client ---
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// ========== Add Content ==========
const addContent = async (req, res) => {
  try {
    const { type, title, content, fileUrl } = req.body;
    const classroomId = req.params.classroomId;
    const userId = req.user?._id || req.userId;

    if (!type || !title || !classroomId) {
      return res.status(400).json({ message: '❌ Missing required fields' });
    }

    const newContent = new ClassroomContent({
      classroom: classroomId,
      type,
      title,
      content,
      fileUrl,
      createdBy: userId
    });

    await newContent.save();

    console.log("✅ New content saved:", newContent);

    res.status(201).json({
      message: '✅ Content added successfully',
      content: newContent
    });

  } catch (error) {
    console.error("❌ Error saving content:", error);
    res.status(500).json({ message: 'Server Error while saving content' });
  }
};

// ========== Get Classroom Content ==========
const getClassroomContent = async (req, res) => {
  try {
    const classroomId = req.params.classroomId;
    const contents = await ClassroomContent.find({ classroom: classroomId }).sort({ createdAt: -1 });

    console.log(`📂 Found ${contents.length} content items for classroom ${classroomId}`);

    res.status(200).json(contents);
  } catch (error) {
    console.error("❌ Error fetching classroom content:", error);
    res.status(500).json({ message: 'Server Error while fetching content' });
  }
};

// ========== Summarize Classroom Content ==========
const summarizeContent = async (req, res) => {
  try {
    const { contentId } = req.params;
    const contentDoc = await ClassroomContent.findById(contentId);

    if (!contentDoc || !contentDoc.content) {
      return res.status(404).json({ message: '❌ Content not found or empty' });
    }
  
    const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes classroom content." },
        { role: "user", content: `Summarize this classroom content:\n\n${contentDoc.content}` }
      ],
    });

    const summary = completion.choices[0].message.content;

    res.json({
      document: contentDoc.title,
      original: contentDoc.content,
      summary,
    });
  } catch (error) {
    console.error("❌ Error summarizing content:", error);
    res.status(500).json({ message: 'Server Error while summarizing content' });
  }
};

module.exports = {
  addContent,
  getClassroomContent,
  summarizeContent, // ✅ new route
};
