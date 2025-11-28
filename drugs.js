// routes/drugs.js
const express = require('express');
const router = express.Router();
const { toJalali } = require('../utils/dateConverter');
const db = require('../config/database');
const { authMiddleware, managerMiddleware } = require('../middleware/auth');

// دریافت تمام دسته‌بندی‌های دارویی
router.get('/categories', authMiddleware, async (req, res) => {
  try {
    const query = `SELECT * FROM drug_categories WHERE is_active = true ORDER BY name`;
    const [categories] = await db.execute(query);
    
    res.json({
      success: true,
      categories: categories
    });
  } catch (err) {
    console.error("Error fetching drug categories:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت دسته‌بندی‌های دارویی'
    });
  }
});

// دریافت اشکال دارویی یک دسته خاص
router.get('/forms/:categoryId', authMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const query = `
      SELECT f.*, c.name as category_name 
      FROM drug_forms f 
      JOIN drug_categories c ON f.category_id = c.id 
      WHERE f.category_id = ? AND f.is_active = true 
      ORDER BY f.name
    `;
    const [forms] = await db.execute(query, [categoryId]);
    
    res.json({
      success: true,
      forms: forms
    });
  } catch (err) {
    console.error("Error fetching drug forms:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت اشکال دارویی'
    });
  }
});

// دریافت تمام اشکال دارویی
router.get('/forms', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT f.*, c.name as category_name 
      FROM drug_forms f 
      JOIN drug_categories c ON f.category_id = c.id 
      WHERE f.is_active = true 
      ORDER BY c.name, f.name
    `;
    const [forms] = await db.execute(query);
    
    res.json({
      success: true,
      forms: forms
    });
  } catch (err) {
    console.error("Error fetching all drug forms:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت اشکال دارویی'
    });
  }
});

module.exports = router;