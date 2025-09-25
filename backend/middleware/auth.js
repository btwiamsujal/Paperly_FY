const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  // Prefer Authorization header, but also accept HttpOnly cookie 'token'
  let token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    // parse from cookies if present (cookie-parser populates req.cookies)
    const cookieToken = req.cookies?.token;
    if (cookieToken && typeof cookieToken === 'string') {
      token = cookieToken;
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Normalize to always have `req.user._id` and `req.user.id`
    req.user = { ...decoded, _id: decoded.id, id: decoded.id };
    next();
  } catch (err) {
    console.error("❌ Invalid token:", err.message);
    res.status(401).json({ message: "Invalid or expired token." });
  }
};

module.exports = auth;
