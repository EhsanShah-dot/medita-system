// middleware/auth.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(403).json({ message: 'توکن احراز هویت فراهم نشده است' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'توکن نامعتبر است' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'شما دسترسی لازم را ندارید' });
  }
  next();
};

const managerMiddleware = (req, res, next) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ message: 'شما دسترسی لازم را ندارید' });
  }
  
  if (!req.user.center_id) {
    return res.status(403).json({ message: 'شناسه مرکز در توکن وجود ندارد' });
  }
  
  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  managerMiddleware
};