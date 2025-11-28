// routes/finance.js
const express = require('express');
const router = express.Router();
const { toJalali, toGregorian, getJalaliMonthInfo, getMonthName } = require('../utils/dateConverter');
const db = require('../config/database');
const { authMiddleware, managerMiddleware } = require('../middleware/auth');

// دسته‌بندی‌های پیش‌فرض
const transactionCategories = {
  income: [
    'حق‌الوصولی درمان',
    'هزینه دارو', 
    'هزینه مشاوره',
    'هزینه آزمایش',
    'سایر درآمدها'
  ],
  expense: [
    'خرید دارو',
    'حقوق پرسنل',
    'هزینه‌های اداری', 
    'هزینه‌های نگهداری',
    'سایر هزینه‌ها'
  ]
};

// ثبت تراکنش جدید
router.post('/transactions', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { patient_id, type, category, amount, description, transaction_date } = req.body;
    const center_id = req.user.center_id;

    // اعتبارسنجی
    if (!patient_id || !type || !category || !amount || !transaction_date) {
      return res.status(400).json({
        success: false,
        message: 'پر کردن تمام فیلدها الزامی است'
      });
    }

    // تبدیل تاریخ شمسی
    const transaction_date_gregorian = toGregorian(transaction_date);
    if (!transaction_date_gregorian) {
      return res.status(400).json({
        success: false,
        message: 'تاریخ شمسی نامعتبر است'
      });
    }

    const query = `
      INSERT INTO financial_transactions 
      (center_id, patient_id, type, category, amount, description, transaction_date, transaction_date_jalali)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.execute(query, [
      center_id, patient_id, type, category, amount, description, 
      transaction_date_gregorian, transaction_date
    ]);

    // به‌روزرسانی بدهی بیمار
    await updatePatientDebt(patient_id);

    res.status(201).json({
      success: true,
      message: 'تراکنش با موفقیت ثبت شد',
      transaction: {
        id: result.insertId,
        patient_id,
        type,
        category,
        amount,
        transaction_date
      }
    });
  } catch (err) {
    console.error("Error creating transaction:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت تراکنش'
    });
  }
});

// دریافت تراکنش‌ها
router.get('/transactions', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;
    const { patient_id, type, start_date, end_date, category } = req.query;
    
    let query = `
      SELECT ft.*, p.first_name, p.last_name 
      FROM financial_transactions ft
      JOIN patients p ON ft.patient_id = p.id
      WHERE p.center_id = ?
    `;
    let params = [center_id];

    if (patient_id) {
      query += ` AND ft.patient_id = ?`;
      params.push(patient_id);
    }

    if (type) {
      query += ` AND ft.type = ?`;
      params.push(type);
    }

    if (category) {
      query += ` AND ft.category = ?`;
      params.push(category);
    }

    if (start_date) {
      const start_date_gregorian = toGregorian(start_date);
      query += ` AND ft.transaction_date >= ?`;
      params.push(start_date_gregorian);
    }

    if (end_date) {
      const end_date_gregorian = toGregorian(end_date);
      query += ` AND ft.transaction_date <= ?`;
      params.push(end_date_gregorian);
    }

    query += ` ORDER BY ft.transaction_date DESC`;

    const [transactions] = await db.execute(query, params);

    res.json({
      success: true,
      transactions: transactions,
      total: transactions.length
    });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تراکنش‌ها'
    });
  }
});

// دریافت دسته‌بندی‌ها
router.get('/categories', authMiddleware, managerMiddleware, (req, res) => {
  res.json({
    success: true,
    categories: transactionCategories
  });
});

// دریافت وضعیت بدهی بیماران
router.get('/debts', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;
    const { status } = req.query;
    
    let query = `
      SELECT pd.*, p.first_name, p.last_name, p.phone_number
      FROM patient_debts pd
      JOIN patients p ON pd.patient_id = p.id
      WHERE p.center_id = ?
    `;
    let params = [center_id];

    if (status) {
      query += ` AND pd.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY pd.remaining_debt DESC`;

    const [debts] = await db.execute(query, params);

    // آمار کلی
    const statsQuery = `
      SELECT 
        COUNT(*) as total_patients,
        SUM(remaining_debt) as total_debt,
        SUM(paid_amount) as total_paid,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_count
      FROM patient_debts pd
      JOIN patients p ON pd.patient_id = p.id
      WHERE p.center_id = ?
    `;
    const [stats] = await db.execute(statsQuery, [center_id]);

    res.json({
      success: true,
      debts: debts,
      statistics: stats[0],
      total: debts.length
    });
  } catch (err) {
    console.error("Error fetching debts:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت اطلاعات بدهی‌ها'
    });
  }
});

// گزارش خلاصه مالی ماهانه
router.get('/reports/monthly-summary', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    const center_id = req.user.center_id;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'سال و ماه شمسی الزامی است'
      });
    }

    const monthInfo = getJalaliMonthInfo(parseInt(year), parseInt(month));
    
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense,
        COUNT(DISTINCT patient_id) as unique_patients
      FROM financial_transactions ft
      JOIN patients p ON ft.patient_id = p.id
      WHERE p.center_id = ? 
        AND ft.transaction_date BETWEEN ? AND ?
        AND ft.status = 'completed'
    `;

    const categoryQuery = `
      SELECT 
        category,
        type,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
      FROM financial_transactions ft
      JOIN patients p ON ft.patient_id = p.id
      WHERE p.center_id = ? 
        AND ft.transaction_date BETWEEN ? AND ?
        AND ft.status = 'completed'
      GROUP BY category, type
      ORDER BY total_amount DESC
    `;

    const [summary] = await db.execute(summaryQuery, [
      center_id, monthInfo.start_date, monthInfo.end_date
    ]);
    
    const [categories] = await db.execute(categoryQuery, [
      center_id, monthInfo.start_date, monthInfo.end_date
    ]);

    res.json({
      success: true,
      summary: {
        ...summary[0],
        net_income: (summary[0].total_income || 0) - (summary[0].total_expense || 0)
      },
      categories: categories,
      period: {
        year: parseInt(year),
        month: parseInt(month),
        month_name: getMonthName(parseInt(month))
      }
    });
  } catch (err) {
    console.error("Error generating financial report:", err);
    res.status(500).json({
      success: false,
      message: 'خطا در تولید گزارش مالی'
    });
  }
});

// تابع به‌روزرسانی بدهی بیمار
async function updatePatientDebt(patient_id) {
  try {
    const calcQuery = `
      SELECT 
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense
      FROM financial_transactions 
      WHERE patient_id = ? AND status = 'completed'
    `;
    const [calc] = await db.execute(calcQuery, [patient_id]);
    
    const totalDebt = (calc[0].total_income || 0);
    const paidAmount = (calc[0].total_expense || 0);
    const remainingDebt = Math.max(0, totalDebt - paidAmount);
    
    let status = 'active';
    if (remainingDebt <= 0) {
      status = 'paid';
    }

    const upsertQuery = `
      INSERT INTO patient_debts (patient_id, total_debt, paid_amount, remaining_debt, status)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_debt = VALUES(total_debt),
        paid_amount = VALUES(paid_amount), 
        remaining_debt = VALUES(remaining_debt),
        status = VALUES(status),
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await db.execute(upsertQuery, [
      patient_id, totalDebt, paidAmount, remainingDebt, status
    ]);
  } catch (err) {
    console.error("Error updating patient debt:", err);
  }
}

module.exports = router;