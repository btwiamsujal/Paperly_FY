const requireAdmin = (getUserById) => async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    next();
  } catch (e) {
    console.error('Admin guard error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { requireAdmin };