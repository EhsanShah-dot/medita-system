// routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { toJalali } = require('../utils/dateConverter');

// Import database connection
const db = require('../config/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// ==================== ADMIN MANAGEMENT ENDPOINTS ====================

// ایجاد ادمین دوم (نیاز به احراز هویت ادمین اول)
router.post('/create-admin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'نام، ایمیل و پسورد الزامی است'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'پسورد باید حداقل ۸ کاراکتر باشد'
      });
    }

    // بررسی وجود ایمیل
    const checkEmailQuery = `SELECT id FROM users WHERE email = ?`;
    const [existingUsers] = await db.execute(checkEmailQuery, [email]);
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'این ایمیل قبلاً ثبت شده است' 
      });
    }

    // ایجاد ادمین جدید
    const hashedPassword = bcrypt.hashSync(password, 10);
    const query = `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')`;
    const [result] = await db.execute(query, [name, email, hashedPassword]);

    console.log(`✅ ادمین جدید ایجاد شد توسط ${req.user.email}: ${email}`);

    res.status(201).json({
      success: true,
      message: 'حساب ادمین جدید با موفقیت ایجاد شد',
      admin: {
        id: result.insertId,
        name: name,
        email: email,
        role: 'admin',
        created_by: req.user.email
      },
      jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error("Error creating admin:", err);
    res.status(500).json({ 
      success: false,
      message: 'خطا در ایجاد حساب ادمین',
      error: err.message 
    });
  }
});

// لیست تمام کاربران
router.get('/all-users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.name, u.email, u.role, u.center_id, u.created_at, c.name as center_name
      FROM users u
      LEFT JOIN centers c ON u.center_id = c.id
      ORDER BY u.role, u.created_at DESC
    `;
    const [users] = await db.execute(query);
    
    // تبدیل تاریخ‌های میلادی به شمسی
    const usersWithJalali = users.map(user => ({
      ...user,
      created_at_jalali: toJalali(user.created_at)
    }));

    res.json({
      success: true,
      total_users: users.length,
      current_jalali_date: toJalali(new Date()),
      users: usersWithJalali
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ 
      success: false,
      message: 'خطا در دریافت کاربران' 
    });
  }
});

// لیست تمام مراکز
router.get('/all-centers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT c.*, u.name as manager_name, u.email as manager_email,
             (SELECT COUNT(*) FROM patients p WHERE p.center_id = c.id AND p.status != 'deleted') as patient_count
      FROM centers c
      LEFT JOIN users u ON c.id = u.center_id AND u.role = 'manager'
      ORDER BY c.created_at DESC
    `;
    const [centers] = await db.execute(query);
    
    // تبدیل تاریخ‌های میلادی به شمسی
    const centersWithJalali = centers.map(center => ({
      ...center,
      created_at_jalali: toJalali(center.created_at)
    }));

    res.json({
      success: true,
      total_centers: centers.length,
      current_jalali_date: toJalali(new Date()),
      centers: centersWithJalali
    });
  } catch (err) {
    console.error("Error fetching centers:", err);
    res.status(500).json({ 
      success: false,
      message: 'خطا در دریافت مراکز' 
    });
  }
});

// به‌روزرسانی وضعیت بیماران
router.post('/update-patient-statuses', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await updatePatientStatuses();
    res.json({ 
      success: true,
      message: 'وضعیت بیماران با موفقیت به‌روزرسانی شد',
      jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error('Error in manual status update:', err);
    res.status(500).json({ 
      success: false,
      message: 'خطا در به‌روزرسانی وضعیت بیماران' 
    });
  }
});

// تابع به‌روزرسانی وضعیت بیماران
async function updatePatientStatuses() {
  try {
    const today = new Date();
    
    // بیمارانی که بیش از ۱۴ روز تحویل نداشته‌اند
    const updateQuery = `
      UPDATE patients p
      LEFT JOIN (
        SELECT patient_id, MAX(delivery_date) as last_delivery
        FROM drug_deliveries 
        GROUP BY patient_id
      ) dd ON p.id = dd.patient_id
      SET p.status = CASE 
        WHEN DATEDIFF(?, COALESCE(dd.last_delivery, p.created_at)) > 14 THEN 'absent'
        ELSE 'active'
      END
      WHERE p.deleted_at IS NULL AND p.status != 'completed'
    `;

    await db.execute(updateQuery, [today]);
    console.log('✅ وضعیت بیماران به‌روزرسانی شد:', toJalali(new Date()));
  } catch (err) {
    console.error('Error updating patient statuses:', err);
  }
}

module.exports = router;