const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  console.log("🔐 Received token:", token);

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log("✅ Token decoded:", decoded);

    // Normalize to always have `req.user._id`
    req.user = { ...decoded, _id: decoded.id };

    next();
  } catch (err) {
    console.error("❌ Invalid token:", err.message);
    res.status(401).json({ message: "Invalid or expired token." });
  }
};

module.exports = auth;
