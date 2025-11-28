// routes/reports.js
const express = require('express');
const router = express.Router();
const { toJalali, getJalaliMonthInfo, getMonthName } = require('../utils/dateConverter');

// Import database connection
const db = require('../config/database');
const { authMiddleware, managerMiddleware, adminMiddleware } = require('../middleware/auth');

// ==================== REPORTING ENDPOINTS ====================

// گزارش ماهانه مرکز
router.get('/monthly', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    const center_id = req.user.center_id;

    if (!year || !month) {
      return res.status(400).json({ 
        success: false,
        message: 'سال و ماه شمسی الزامی است' 
      });
    }

    // اطلاعات ماه شمسی
    const monthInfo = getJalaliMonthInfo(parseInt(year), parseInt(month));
    if (!monthInfo) {
      return res.status(400).json({ 
        success: false,
        message: 'تاریخ شمسی نامعتبر است' 
      });
    }

    // آمار بیماران
    const patientStatsQuery = `
      SELECT 
        COUNT(*) as total_patients,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_patients,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_patients,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_patients
      FROM patients 
      WHERE center_id = ? AND created_at <= ? AND deleted_at IS NULL
    `;

    // آمار تحویل دارو
    const deliveryStatsQuery = `
      SELECT COUNT(*) as total_deliveries
      FROM drug_deliveries 
      WHERE patient_id IN (
        SELECT id FROM patients WHERE center_id = ?
      ) AND delivery_date_gregorian BETWEEN ? AND ?
    `;

    const [patientStats] = await db.execute(patientStatsQuery, [center_id, monthInfo.end_date]);
    const [deliveryStats] = await db.execute(deliveryStatsQuery, [
      center_id, 
      monthInfo.start_date, 
      monthInfo.end_date
    ]);

    // ذخیره گزارش در جدول monthly_reports
    const upsertReportQuery = `
      INSERT INTO monthly_reports (center_id, jalali_year, jalali_month, total_patients, active_patients, absent_patients, total_deliveries)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_patients = VALUES(total_patients),
        active_patients = VALUES(active_patients),
        absent_patients = VALUES(absent_patients),
        total_deliveries = VALUES(total_deliveries),
        updated_at = CURRENT_TIMESTAMP
    `;

    await db.execute(upsertReportQuery, [
      center_id,
      parseInt(year),
      parseInt(month),
      patientStats[0].total_patients,
      patientStats[0].active_patients,
      patientStats[0].absent_patients,
      deliveryStats[0].total_deliveries
    ]);

    const report = {
      year: parseInt(year),
      month: parseInt(month),
      month_name: getMonthName(parseInt(month)),
      ...monthInfo,
      statistics: {
        total_patients: patientStats[0].total_patients,
        active_patients: patientStats[0].active_patients,
        absent_patients: patientStats[0].absent_patients,
        completed_patients: patientStats[0].completed_patients,
        total_deliveries: deliveryStats[0].total_deliveries
      }
    };

    res.json({
      success: true,
      report: report
    });
  } catch (err) {
    console.error('Error generating monthly report:', err);
    res.status(500).json({ 
      success: false,
      message: 'خطا در تولید گزارش' 
    });
  }
});

// گزارش بیماران غایب
router.get('/absent-patients', authMiddleware, managerMiddleware, async (req, res) => {
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
    
    const absentPatientsQuery = `
      SELECT p.*, 
             MAX(dd.delivery_date_gregorian) as last_delivery_date,
             DATEDIFF(?, COALESCE(MAX(dd.delivery_date_gregorian), p.created_at)) as days_absent
      FROM patients p
      LEFT JOIN drug_deliveries dd ON p.id = dd.patient_id
      WHERE p.center_id = ? 
        AND p.status = 'active'
        AND (dd.delivery_date_gregorian IS NULL OR dd.delivery_date_gregorian <= ?)
      GROUP BY p.id
      HAVING days_absent > 14 OR days_absent IS NULL
    `;

    const [absentPatients] = await db.execute(absentPatientsQuery, [
      monthInfo.end_date,
      center_id,
      monthInfo.end_date
    ]);

    // تبدیل تاریخ‌ها به شمسی
    const patientsWithJalali = absentPatients.map(patient => ({
      ...patient,
      created_at_jalali: toJalali(patient.created_at),
      last_delivery_date_jalali: patient.last_delivery_date ? toJalali(patient.last_delivery_date) : null,
      days_absent: patient.days_absent || 'بدون سابقه تحویل'
    }));

    res.json({
      success: true,
      year: parseInt(year),
      month: parseInt(month),
      month_name: getMonthName(parseInt(month)),
      absent_count: absentPatients.length,
      patients: patientsWithJalali
    });
  } catch (err) {
    console.error('Error fetching absent patients:', err);
    res.status(500).json({ 
      success: false,
      message: 'خطا در دریافت بیماران غایب' 
    });
  }
});

// گزارش کلی سیستم (فقط برای ادمین)
router.get('/system-overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // آمار کلی سیستم
    const totalCentersQuery = `SELECT COUNT(*) as total FROM centers`;
    const totalManagersQuery = `SELECT COUNT(*) as total FROM users WHERE role = 'manager'`;
    const totalPatientsQuery = `SELECT COUNT(*) as total FROM patients WHERE deleted_at IS NULL`;
    const totalDeliveriesQuery = `SELECT COUNT(*) as total FROM drug_deliveries`;
    
    const [centersCount] = await db.execute(totalCentersQuery);
    const [managersCount] = await db.execute(totalManagersQuery);
    const [patientsCount] = await db.execute(totalPatientsQuery);
    const [deliveriesCount] = await db.execute(totalDeliveriesQuery);

    // مراکز فعال (با اشتراک معتبر)
    const activeCentersQuery = `
      SELECT COUNT(DISTINCT center_id) as total 
      FROM center_subscriptions 
      WHERE end_date > NOW()
    `;
    const [activeCenters] = await db.execute(activeCentersQuery);

    res.json({
      success: true,
      overview: {
        total_centers: centersCount[0].total,
        active_centers: activeCenters[0].total,
        total_managers: managersCount[0].total,
        total_patients: patientsCount[0].total,
        total_deliveries: deliveriesCount[0].total
      },
      current_jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error('Error generating system overview:', err);
    res.status(500).json({ 
      success: false,
      message: 'خطا در تولید گزارش کلی سیستم' 
    });
  }
});

module.exports = router;