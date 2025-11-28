// routes/deliveries.js - نسخه بهبود یافته با مدیریت موجودی
const express = require('express');
const router = express.Router();
const { toJalali, toGregorian } = require('../utils/dateConverter');
const db = require('../config/database');
const { authMiddleware, managerMiddleware } = require('../middleware/auth');

// ثبت تحویل دارو + کسر از موجودی
router.post('/', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { patient_id, drug_form_id, quantity, actual_dosage, delivery_date, notes } = req.body;
    const center_id = req.user.center_id;

    if (!patient_id || !drug_form_id || !quantity || !delivery_date) {
      return res.status(400).json({
        success: false,
        message: 'شناسه بیمار، شکل دارو، مقدار و تاریخ تحویل الزامی است'
      });
    }

    // بررسی وجود بیمار
    const patientCheckQuery = `SELECT id FROM patients WHERE id = ? AND center_id = ? AND deleted_at IS NULL`;
    const [patients] = await db.execute(patientCheckQuery, [patient_id, center_id]);
    
    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'بیمار یافت نشد'
      });
    }

    // بررسی موجودی کافی
    const stockCheckQuery = `
      SELECT current_stock 
      FROM monthly_inventory 
      WHERE center_id = ? AND drug_form_id = ? 
      ORDER BY jalali_year DESC, jalali_month DESC 
      LIMIT 1
    `;
    const [stock] = await db.execute(stockCheckQuery, [center_id, drug_form_id]);
    
    if (stock.length === 0 || stock[0].current_stock < quantity) {
      return res.status(400).json({
        success: false,
        message: 'موجودی کافی نیست',
        current_stock: stock.length > 0 ? stock[0].current_stock : 0,
        requested_quantity: quantity
      });
    }

    // تبدیل تاریخ شمسی
    const delivery_date_gregorian = toGregorian(delivery_date);
    if (!delivery_date_gregorian) {
      return res.status(400).json({
        success: false,
        message: 'تاریخ شمسی نامعتبر است'
      });
    }

    // دریافت سال و ماه شمسی برای آپدیت موجودی ماهانه
    const jalaliDate = toJalali(delivery_date_gregorian, 'jYYYY/jMM/jDD').split('/');
    const year = parseInt(jalaliDate[0]);
    const month = parseInt(jalaliDate[1]);

    // شروع تراکنش دیتابیس
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // 1. ثبت تحویل دارو
      const deliveryQuery = `
        INSERT INTO drug_deliveries 
        (patient_id, drug_form_id, quantity, actual_dosage, delivery_date, delivery_date_gregorian, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const [deliveryResult] = await connection.execute(deliveryQuery, [
        patient_id, drug_form_id, quantity, actual_dosage, 
        delivery_date, delivery_date_gregorian, notes
      ]);

      // 2. آپدیت موجودی ماهانه (کسر از موجودی)
      const updateInventoryQuery = `
        INSERT INTO monthly_inventory 
          (center_id, drug_form_id, jalali_year, jalali_month, delivered_stock, current_stock)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          delivered_stock = delivered_stock + VALUES(delivered_stock),
          current_stock = current_stock - VALUES(delivered_stock),
          updated_at = CURRENT_TIMESTAMP
      `;

      await connection.execute(updateInventoryQuery, [
        center_id, drug_form_id, year, month, quantity, quantity
      ]);

      // 3. به‌روزرسانی آخرین تاریخ تحویل بیمار
      await connection.execute(
        'UPDATE patients SET last_delivery_date = ? WHERE id = ?',
        [delivery_date_gregorian, patient_id]
      );

      // 4. ثبت در history تراکنش‌های انبار
      const transactionQuery = `
        INSERT INTO inventory_transactions 
          (drug_form_id, center_id, transaction_type, quantity, previous_quantity, new_quantity, 
           reference_id, reference_type, description, transaction_date, transaction_date_jalali, created_by)
        VALUES (?, ?, 'delivery', ?, ?, ?, ?, 'delivery', 'تحویل دارو به بیمار', CURDATE(), ?, ?)
      `;

      // محاسبه موجودی قبلی و جدید
      const previousStock = stock[0].current_stock;
      const newStock = previousStock - quantity;

      await connection.execute(transactionQuery, [
        drug_form_id, center_id, -quantity, previousStock, newStock, 
        deliveryResult.insertId, toJalali(new Date()), req.user.userId
      ]);

      // تایید تراکنش
      await connection.commit();

      res.status(201).json({
        success: true,
        message: 'تحویل دارو با موفقیت ثبت شد و از موجودی کسر گردید',
        delivery: {
          id: deliveryResult.insertId,
          patient_id,
          drug_form_id,
          quantity,
          actual_dosage,
          delivery_date
        },
        inventory_update: {
          previous_stock: previousStock,
          new_stock: newStock,
          remaining_stock: newStock
        }
      });

    } catch (transactionErr) {
      // Rollback در صورت خطا
      await connection.rollback();
      throw transactionErr;
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error("Error creating delivery:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت تحویل دارو'
    });
  }
});

// دریافت تاریخچه تحویل‌ها با اطلاعات موجودی
router.get('/', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;
    const { patient_id, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        dd.*,
        p.first_name,
        p.last_name,
        df.name as drug_name,
        df.strength,
        df.unit,
        dc.name as category_name
      FROM drug_deliveries dd
      JOIN patients p ON dd.patient_id = p.id
      JOIN drug_forms df ON dd.drug_form_id = df.id
      JOIN drug_categories dc ON df.category_id = dc.id
      WHERE p.center_id = ?
    `;
    let params = [center_id];

    if (patient_id) {
      query += ` AND dd.patient_id = ?`;
      params.push(patient_id);
    }

    if (start_date) {
      const start_date_gregorian = toGregorian(start_date);
      query += ` AND dd.delivery_date_gregorian >= ?`;
      params.push(start_date_gregorian);
    }

    if (end_date) {
      const end_date_gregorian = toGregorian(end_date);
      query += ` AND dd.delivery_date_gregorian <= ?`;
      params.push(end_date_gregorian);
    }

    query += ` ORDER BY dd.delivery_date_gregorian DESC, dd.created_at DESC`;

    const [deliveries] = await db.execute(query, params);

    // تبدیل تاریخ‌ها به شمسی
    const deliveriesWithJalali = deliveries.map(delivery => ({
      ...delivery,
      delivery_date_jalali: delivery.delivery_date,
      delivery_date_gregorian: undefined // مخفی کردن تاریخ میلادی از پاسخ
    }));

    res.json({
      success: true,
      deliveries: deliveriesWithJalali,
      total: deliveries.length,
      current_jalali_date: toJalali(new Date())
    });

  } catch (err) {
    console.error("Error fetching deliveries:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تاریخچه تحویل‌ها'
    });
  }
});

module.exports = router;