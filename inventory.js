// routes/inventory.js
const express = require('express');
const router = express.Router();
const { toJalali, toGregorian, getJalaliMonthInfo } = require('../utils/dateConverter');
const db = require('../config/database');
const { authMiddleware, managerMiddleware } = require('../middleware/auth');

// ==================== INVENTORY MANAGEMENT ENDPOINTS ====================

// ثبت موجودی اولیه ماه
router.post('/initial-stock', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { drug_form_id, initial_stock, year, month } = req.body;
    const center_id = req.user.center_id;

    if (!drug_form_id || !initial_stock || !year || !month) {
      return res.status(400).json({
        success: false,
        message: 'شناسه دارو، موجودی اولیه، سال و ماه شمسی الزامی است'
      });
    }

    // بررسی وجود دارو
    const drugCheckQuery = `SELECT id FROM drug_forms WHERE id = ? AND is_active = true`;
    const [drugs] = await db.execute(drugCheckQuery, [drug_form_id]);
    
    if (drugs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'شکل دارویی یافت نشد'
      });
    }

    // ثبت یا آپدیت موجودی ماهانه
    const upsertQuery = `
      INSERT INTO monthly_inventory 
        (center_id, drug_form_id, jalali_year, jalali_month, initial_stock, current_stock)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        initial_stock = VALUES(initial_stock),
        current_stock = current_stock + (VALUES(initial_stock) - initial_stock),
        updated_at = CURRENT_TIMESTAMP
    `;

    const [result] = await db.execute(upsertQuery, [
      center_id, drug_form_id, year, month, initial_stock, initial_stock
    ]);

    // ثبت در drug_inventory برای تاریخچه
    const inventoryQuery = `
      INSERT INTO drug_inventory 
        (drug_form_id, center_id, initial_quantity, current_quantity, is_initial_stock, monthly_inventory_id)
      VALUES (?, ?, ?, ?, true, ?)
    `;

    await db.execute(inventoryQuery, [
      drug_form_id, center_id, initial_stock, initial_stock, result.insertId
    ]);

    res.status(201).json({
      success: true,
      message: 'موجودی اولیه ماه با موفقیت ثبت شد',
      inventory: {
        id: result.insertId,
        drug_form_id,
        initial_stock,
        year,
        month,
        current_stock: initial_stock
      },
      jalali_date: toJalali(new Date())
    });

  } catch (err) {
    console.error("Error recording initial stock:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت موجودی اولیه'
    });
  }
});

// ثبت خرید دارو
router.post('/purchase', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { 
      drug_form_id, 
      quantity, 
      unit_cost, 
      supplier, 
      batch_number, 
      expiry_date, 
      purchase_date,
      storage_conditions 
    } = req.body;
    
    const center_id = req.user.center_id;

    if (!drug_form_id || !quantity || !purchase_date) {
      return res.status(400).json({
        success: false,
        message: 'شناسه دارو، مقدار و تاریخ خرید الزامی است'
      });
    }

    // بررسی وجود دارو
    const drugCheckQuery = `SELECT id FROM drug_forms WHERE id = ? AND is_active = true`;
    const [drugs] = await db.execute(drugCheckQuery, [drug_form_id]);
    
    if (drugs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'شکل دارویی یافت نشد'
      });
    }

    // تبدیل تاریخ شمسی
    const purchase_date_gregorian = toGregorian(purchase_date);
    const expiry_date_gregorian = expiry_date ? toGregorian(expiry_date) : null;

    if (!purchase_date_gregorian) {
      return res.status(400).json({
        success: false,
        message: 'تاریخ خرید نامعتبر است'
      });
    }

    // دریافت سال و ماه شمسی
    const jalaliDate = toJalali(purchase_date_gregorian, 'jYYYY/jMM/jDD').split('/');
    const year = parseInt(jalaliDate[0]);
    const month = parseInt(jalaliDate[1]);

    // ثبت خرید در drug_inventory
    const inventoryQuery = `
      INSERT INTO drug_inventory 
        (drug_form_id, center_id, batch_number, expiry_date, initial_quantity, 
         current_quantity, unit_cost, supplier, purchase_date, storage_conditions, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `;

    const [inventoryResult] = await db.execute(inventoryQuery, [
      drug_form_id, center_id, batch_number, expiry_date_gregorian, quantity,
      quantity, unit_cost, supplier, purchase_date_gregorian, storage_conditions
    ]);

    // آپدیت موجودی ماهانه
    const updateMonthlyQuery = `
      INSERT INTO monthly_inventory 
        (center_id, drug_form_id, jalali_year, jalali_month, purchased_stock, current_stock)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        purchased_stock = purchased_stock + VALUES(purchased_stock),
        current_stock = current_stock + VALUES(current_stock),
        updated_at = CURRENT_TIMESTAMP
    `;

    await db.execute(updateMonthlyQuery, [
      center_id, drug_form_id, year, month, quantity, quantity
    ]);

    res.status(201).json({
      success: true,
      message: 'خرید دارو با موفقیت ثبت شد',
      purchase: {
        id: inventoryResult.insertId,
        drug_form_id,
        quantity,
        unit_cost,
        purchase_date
      },
      jalali_date: toJalali(new Date())
    });

  } catch (err) {
    console.error("Error recording purchase:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت خرید دارو'
    });
  }
});

// دریافت موجودی فعلی تمام داروها
router.get('/current', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;

    const query = `
      SELECT 
        mi.drug_form_id,
        df.name as drug_name,
        df.strength,
        df.unit,
        df.dosage_unit,
        dc.name as category_name,
        COALESCE(mi.current_stock, 0) as current_stock,
        mi.jalali_year,
        mi.jalali_month
      FROM drug_forms df
      JOIN drug_categories dc ON df.category_id = dc.id
      LEFT JOIN monthly_inventory mi ON df.id = mi.drug_form_id AND mi.center_id = ?
      WHERE df.is_active = true
      ORDER BY dc.name, df.name
    `;

    const [inventory] = await db.execute(query, [center_id]);

    res.json({
      success: true,
      inventory: inventory,
      total_drugs: inventory.length,
      current_jalali_date: toJalali(new Date())
    });

  } catch (err) {
    console.error("Error fetching current inventory:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت موجودی فعلی'
    });
  }
});
// اضافه کردن به انتهای فایل routes/inventory.js

// گزارش ماهانه انبار
router.get('/monthly-report', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    const center_id = req.user.center_id;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'سال و ماه شمسی الزامی است'
      });
    }

    const monthlyReportQuery = `
      SELECT 
        mi.drug_form_id,
        df.name as drug_name,
        df.strength,
        df.unit,
        dc.name as category_name,
        mi.initial_stock,
        mi.purchased_stock,
        mi.delivered_stock,
        mi.current_stock,
        (mi.initial_stock + mi.purchased_stock - mi.delivered_stock) as calculated_stock,
        CASE 
          WHEN mi.current_stock <= 0 THEN 'تمام شده'
          WHEN mi.current_stock < (mi.initial_stock + mi.purchased_stock) * 0.2 THEN 'در حال اتمام'
          ELSE 'کافی'
        END as stock_status
      FROM monthly_inventory mi
      JOIN drug_forms df ON mi.drug_form_id = df.id
      JOIN drug_categories dc ON df.category_id = dc.id
      WHERE mi.center_id = ? AND mi.jalali_year = ? AND mi.jalali_month = ?
      ORDER BY dc.name, df.name
    `;

    const [monthlyData] = await db.execute(monthlyReportQuery, [center_id, year, month]);

    // آمار کلی ماه
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_drugs,
        SUM(initial_stock) as total_initial,
        SUM(purchased_stock) as total_purchased,
        SUM(delivered_stock) as total_delivered,
        SUM(current_stock) as total_current,
        SUM(CASE WHEN current_stock <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
        SUM(CASE WHEN current_stock < (initial_stock + purchased_stock) * 0.2 THEN 1 ELSE 0 END) as low_stock_count
      FROM monthly_inventory 
      WHERE center_id = ? AND jalali_year = ? AND jalali_month = ?
    `;

    const [summary] = await db.execute(summaryQuery, [center_id, year, month]);

    res.json({
      success: true,
      report: {
        year: parseInt(year),
        month: parseInt(month),
        monthly_data: monthlyData,
        summary: summary[0],
        generated_at: toJalali(new Date())
      }
    });

  } catch (err) {
    console.error("Error generating monthly report:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در تولید گزارش ماهانه'
    });
  }
});

// هشدارهای موجودی کم
router.get('/low-stock-alerts', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;

    const alertQuery = `
      SELECT 
        mi.drug_form_id,
        df.name as drug_name,
        df.strength,
        df.unit,
        dc.name as category_name,
        mi.current_stock,
        mi.jalali_year,
        mi.jalali_month,
        CASE 
          WHEN mi.current_stock <= 0 THEN 'تمام شده'
          WHEN mi.current_stock < 100 THEN 'بسیار کم'
          WHEN mi.current_stock < 500 THEN 'کم'
          ELSE 'کافی'
        END as alert_level,
        ROUND((mi.current_stock / (mi.initial_stock + mi.purchased_stock)) * 100, 2) as remaining_percentage
      FROM monthly_inventory mi
      JOIN drug_forms df ON mi.drug_form_id = df.id
      JOIN drug_categories dc ON df.category_id = dc.id
      WHERE mi.center_id = ? 
        AND (mi.current_stock <= 0 OR mi.current_stock < 500)
        AND (mi.jalali_year * 100 + mi.jalali_month) = (
          SELECT MAX(jalali_year * 100 + jalali_month) 
          FROM monthly_inventory 
          WHERE center_id = ?
        )
      ORDER BY mi.current_stock ASC
    `;

    const [alerts] = await db.execute(alertQuery, [center_id, center_id]);

    res.json({
      success: true,
      alerts: alerts,
      total_alerts: alerts.length,
      critical_alerts: alerts.filter(a => a.alert_level === 'تمام شده' || a.alert_level === 'بسیار کم').length,
      current_jalali_date: toJalali(new Date())
    });

  } catch (err) {
    console.error("Error fetching stock alerts:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت هشدارهای موجودی'
    });
  }
});

// تاریخچه تراکنش‌های انبار
router.get('/transactions', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;
    const { drug_form_id, start_date, end_date, transaction_type } = req.query;
    
    let query = `
      SELECT 
        it.*,
        df.name as drug_name,
        df.strength,
        df.unit,
        u.name as created_by_name,
        CASE it.reference_type
          WHEN 'delivery' THEN CONCAT('تحویل به بیمار - ', p.first_name, ' ', p.last_name)
          WHEN 'purchase' THEN 'خرید دارو'
          WHEN 'initial' THEN 'موجودی اولیه'
          ELSE it.description
        END as transaction_description
      FROM inventory_transactions it
      JOIN drug_forms df ON it.drug_form_id = df.id
      LEFT JOIN users u ON it.created_by = u.id
      LEFT JOIN drug_deliveries dd ON it.reference_id = dd.id AND it.reference_type = 'delivery'
      LEFT JOIN patients p ON dd.patient_id = p.id
      WHERE it.center_id = ?
    `;
    let params = [center_id];

    if (drug_form_id) {
      query += ` AND it.drug_form_id = ?`;
      params.push(drug_form_id);
    }

    if (transaction_type) {
      query += ` AND it.transaction_type = ?`;
      params.push(transaction_type);
    }

    if (start_date) {
      const start_date_gregorian = toGregorian(start_date);
      query += ` AND it.transaction_date >= ?`;
      params.push(start_date_gregorian);
    }

    if (end_date) {
      const end_date_gregorian = toGregorian(end_date);
      query += ` AND it.transaction_date <= ?`;
      params.push(end_date_gregorian);
    }

    query += ` ORDER BY it.transaction_date DESC, it.created_at DESC`;

    const [transactions] = await db.execute(query, params);

    // تبدیل تاریخ‌ها به شمسی
    const transactionsWithJalali = transactions.map(transaction => ({
      ...transaction,
      transaction_date_jalali: toJalali(transaction.transaction_date),
      transaction_date: undefined // مخفی کردن تاریخ میلادی
    }));

    res.json({
      success: true,
      transactions: transactionsWithJalali,
      total: transactions.length,
      current_jalali_date: toJalali(new Date())
    });

  } catch (err) {
    console.error("Error fetching inventory transactions:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تاریخچه تراکنش‌ها'
    });
  }
});

// داشبورد خلاصه انبار
router.get('/dashboard', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;

    // آمار کلی
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT drug_form_id) as total_drug_types,
        SUM(current_stock) as total_current_stock,
        SUM(CASE WHEN current_stock <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
        SUM(CASE WHEN current_stock < 100 THEN 1 ELSE 0 END) as critical_stock_count,
        SUM(CASE WHEN current_stock BETWEEN 100 AND 500 THEN 1 ELSE 0 END) as low_stock_count
      FROM monthly_inventory 
      WHERE center_id = ? 
        AND (jalali_year * 100 + jalali_month) = (
          SELECT MAX(jalali_year * 100 + jalali_month) 
          FROM monthly_inventory 
          WHERE center_id = ?
        )
    `;

    // پرمصرف‌ترین داروها
    const topDrugsQuery = `
      SELECT 
        df.name as drug_name,
        dc.name as category_name,
        SUM(dd.quantity) as total_delivered,
        COUNT(dd.id) as delivery_count
      FROM drug_deliveries dd
      JOIN drug_forms df ON dd.drug_form_id = df.id
      JOIN drug_categories dc ON df.category_id = dc.id
      JOIN patients p ON dd.patient_id = p.id
      WHERE p.center_id = ? 
        AND dd.delivery_date_gregorian >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY df.id, df.name, dc.name
      ORDER BY total_delivered DESC
      LIMIT 10
    `;

    const [stats] = await db.execute(statsQuery, [center_id, center_id]);
    const [topDrugs] = await db.execute(topDrugsQuery, [center_id]);

    res.json({
      success: true,
      dashboard: {
        statistics: stats[0],
        top_drugs: topDrugs,
        current_month: toJalali(new Date(), 'jYYYY/jMM'),
        generated_at: toJalali(new Date())
      }
    });

  } catch (err) {
    console.error("Error generating inventory dashboard:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در تولید داشبورد انبار'
    });
  }
});
module.exports = router;