// routes/patients.js
const express = require('express');
const router = express.Router();
const { toJalali } = require('../utils/dateConverter');

// Import database connection
const db = require('../config/database');
const { authMiddleware, managerMiddleware } = require('../middleware/auth');

// ==================== PATIENT MANAGEMENT ENDPOINTS ====================

// ایجاد بیمار جدید
router.post('/', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { first_name, last_name, birth_date, gender, address, phone_number, notes } = req.body;
    const center_id = req.user.center_id;

    if (!first_name || !last_name || !gender) {
      return res.status(400).json({
        success: false,
        message: 'نام، نام خانوادگی و جنسیت الزامی است'
      });
    }

    const query = `
      INSERT INTO patients (center_id, first_name, last_name, birth_date, gender, address, phone_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.execute(query, [
      center_id, first_name, last_name, birth_date, gender, address, phone_number, notes
    ]);

    res.status(201).json({
      success: true,
      message: 'بیمار با موفقیت ثبت شد',
      patient: {
        id: result.insertId,
        first_name,
        last_name,
        gender,
        center_id
      },
      jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error("Error creating patient:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت بیمار'
    });
  }
});

// لیست بیماران مرکز
router.get('/', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;
    const { status, search } = req.query;
    
    let query = `
      SELECT * FROM patients 
      WHERE center_id = ? AND deleted_at IS NULL
    `;
    let params = [center_id];

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (first_name LIKE ? OR last_name LIKE ? OR phone_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY created_at DESC`;

    const [patients] = await db.execute(query, params);

    // تبدیل تاریخ‌ها به شمسی
    const patientsWithJalali = patients.map(patient => ({
      ...patient,
      created_at_jalali: toJalali(patient.created_at),
      birth_date_jalali: patient.birth_date ? toJalali(patient.birth_date) : null,
      last_delivery_date_jalali: patient.last_delivery_date ? toJalali(patient.last_delivery_date) : null
    }));

    res.json({
      success: true,
      patients: patientsWithJalali,
      total: patients.length,
      current_jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error("Error fetching patients:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت بیماران'
    });
  }
});

// دریافت اطلاعات یک بیمار خاص
router.get('/:id', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const center_id = req.user.center_id;

    const query = `
      SELECT * FROM patients 
      WHERE id = ? AND center_id = ? AND deleted_at IS NULL
    `;
    
    const [patients] = await db.execute(query, [id, center_id]);

    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'بیمار یافت نشد'
      });
    }

    const patient = patients[0];
    
    // تبدیل تاریخ‌ها به شمسی
    const patientWithJalali = {
      ...patient,
      created_at_jalali: toJalali(patient.created_at),
      birth_date_jalali: patient.birth_date ? toJalali(patient.birth_date) : null,
      last_delivery_date_jalali: patient.last_delivery_date ? toJalali(patient.last_delivery_date) : null
    };

    res.json({
      success: true,
      patient: patientWithJalali
    });
  } catch (err) {
    console.error("Error fetching patient:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت اطلاعات بیمار'
    });
  }
});

// به‌روزرسانی اطلاعات بیمار
router.put('/:id', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const center_id = req.user.center_id;
    const { first_name, last_name, birth_date, gender, address, phone_number, notes, status } = req.body;

    // بررسی وجود بیمار
    const checkQuery = `SELECT id FROM patients WHERE id = ? AND center_id = ? AND deleted_at IS NULL`;
    const [existingPatients] = await db.execute(checkQuery, [id, center_id]);

    if (existingPatients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'بیمار یافت نشد'
      });
    }

    const updateQuery = `
      UPDATE patients 
      SET first_name = ?, last_name = ?, birth_date = ?, gender = ?, 
          address = ?, phone_number = ?, notes = ?, status = ?, updated_at = NOW()
      WHERE id = ? AND center_id = ?
    `;
    
    await db.execute(updateQuery, [
      first_name, last_name, birth_date, gender, address, phone_number, notes, status, id, center_id
    ]);

    res.json({
      success: true,
      message: 'اطلاعات بیمار با موفقیت به‌روزرسانی شد',
      jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error("Error updating patient:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در به‌روزرسانی اطلاعات بیمار'
    });
  }
});

// حذف نرم بیمار
router.delete('/:id', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const center_id = req.user.center_id;

    const query = `
      UPDATE patients 
      SET deleted_at = NOW(), status = 'deleted' 
      WHERE id = ? AND center_id = ? AND deleted_at IS NULL
    `;
    
    const [result] = await db.execute(query, [id, center_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'بیمار یافت نشد'
      });
    }

    res.json({
      success: true,
      message: 'بیمار با موفقیت حذف شد',
      jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error("Error deleting patient:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در حذف بیمار'
    });
  }
});

module.exports = router;