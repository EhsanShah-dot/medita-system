// routes/payments.js
const express = require('express');
const router = express.Router();
const zibal = require('zibal');
const { toJalali } = require('../utils/dateConverter');

// Import database connection
const db = require('../config/database');
const { authMiddleware, managerMiddleware } = require('../middleware/auth');

// پیکربندی زیبال
const ZIBAL_CONFIG = {
  merchant: process.env.ZIBAL_MERCHANT || "681bbe7b3eb76700105bf403",
  callbackUrl: process.env.ZIBAL_CALLBACK_URL || 'http://localhost:3000/payment/verify',
  sandbox: process.env.ZIBAL_SANDBOX === 'true' || false
};

// ==================== PAYMENT & SUBSCRIPTION ENDPOINTS ====================

// لیست پلن‌های اشتراک
router.get('/subscriptions/plans', authMiddleware, async (req, res) => {
  try {
    const query = `SELECT * FROM subscriptions WHERE is_active = 1 ORDER BY price ASC`;
    const [plans] = await db.execute(query);
    
    res.json({
      success: true,
      plans: plans,
      current_jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error('Error fetching subscription plans:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت پلن‌های اشتراک'
    });
  }
});

// وضعیت اشتراک مرکز
router.get('/subscriptions/center-status', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;
    
    const statusQuery = `
      SELECT cs.*, s.plan_name, s.max_patients, s.can_view_reports, s.can_export_reports, s.has_help_panel
      FROM center_subscriptions cs
      JOIN subscriptions s ON cs.subscription_id = s.id
      WHERE cs.center_id = ?
      ORDER BY cs.end_date DESC
      LIMIT 1
    `;
    
    const [subscription] = await db.execute(statusQuery, [center_id]);
    
    // تعداد بیماران فعلی مرکز
    const patientCountQuery = `SELECT COUNT(*) as patient_count FROM patients WHERE center_id = ? AND status != 'deleted'`;
    const [patientCount] = await db.execute(patientCountQuery, [center_id]);
    
    const hasActiveSubscription = subscription.length > 0 && new Date(subscription[0].end_date) > new Date();

    res.json({
      success: true,
      subscription: subscription[0] || null,
      current_patient_count: patientCount[0].patient_count,
      has_active_subscription: hasActiveSubscription,
      can_add_more_patients: hasActiveSubscription ? 
        patientCount[0].patient_count < subscription[0].max_patients : false,
      current_jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error('Error fetching subscription status:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت وضعیت اشتراک'
    });
  }
});

// شروع پرداخت
router.post('/initiate', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const { subscription_id } = req.body;
    const center_id = req.user.center_id;

    if (!subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'شناسه پلن اشتراک الزامی است'
      });
    }

    // دریافت اطلاعات پلن
    const planQuery = `SELECT * FROM subscriptions WHERE id = ? AND is_active = 1`;
    const [plans] = await db.execute(planQuery, [subscription_id]);
    
    if (plans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'پلن اشتراک یافت نشد'
      });
    }

    const plan = plans[0];
    const amount = plan.discount_price || plan.price;

    // داده‌های پرداخت
    const paymentData = {
      merchant: ZIBAL_CONFIG.merchant,
      amount: amount * 10, // تبدیل به ریال
      callbackUrl: ZIBAL_CONFIG.callbackUrl,
      description: `اشتراک ${plan.plan_name} - مرکز ترک اعتیاد`,
      orderId: `sub-${center_id}-${Date.now()}`
    };

    // ایجاد تراکنش در زیبال
    const result = await zibal.create(paymentData);
    
    if (result.result === 100) {
      // ذخیره اطلاعات پرداخت در دیتابیس
      const paymentQuery = `
        INSERT INTO payments (center_id, subscription_id, amount, trackId, status, description) 
        VALUES (?, ?, ?, ?, 'pending', ?)
      `;
      await db.execute(paymentQuery, [
        center_id, 
        subscription_id, 
        amount, 
        result.trackId,
        `پرداخت اشتراک ${plan.plan_name}`
      ]);
      
      res.json({
        success: true,
        paymentUrl: `https://gateway.zibal.ir/start/${result.trackId}`,
        trackId: result.trackId,
        amount: amount,
        plan_name: plan.plan_name,
        jalali_date: toJalali(new Date())
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'خطا در اتصال به درگاه پرداخت',
        errorCode: result.result
      });
    }
  } catch (err) {
    console.error('Error initiating payment:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در شروع پرداخت'
    });
  }
});

// تایید پرداخت
router.post('/verify', async (req, res) => {
  try {
    const { trackId, success } = req.body;
    
    if (success == "1") {
      // تایید پرداخت در زیبال
      const verifyResult = await zibal.verify({ trackId, merchant: ZIBAL_CONFIG.merchant });
      
      if (verifyResult.result === 100) {
        // پرداخت موفق
        const paymentQuery = `
          SELECT p.*, s.duration_months, s.max_patients 
          FROM payments p 
          JOIN subscriptions s ON p.subscription_id = s.id 
          WHERE p.trackId = ?
        `;
        const [payments] = await db.execute(paymentQuery, [trackId]);
        
        if (payments.length > 0) {
          const payment = payments[0];
          
          // محاسبه تاریخ شروع و پایان اشتراک
          const startDate = new Date();
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + payment.duration_months);
          
          // ثبت اشتراک مرکز
          const subscriptionQuery = `
            INSERT INTO center_subscriptions (center_id, subscription_id, start_date, end_date)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              subscription_id = VALUES(subscription_id),
              start_date = VALUES(start_date),
              end_date = VALUES(end_date)
          `;
          await db.execute(subscriptionQuery, [
            payment.center_id,
            payment.subscription_id,
            startDate,
            endDate
          ]);
          
          // به‌روزرسانی وضعیت پرداخت
          await db.execute(
            'UPDATE payments SET status = "success", payment_date = NOW() WHERE trackId = ?',
            [trackId]
          );
          
          res.json({ 
            success: true, 
            message: 'پرداخت با موفقیت انجام شد و اشتراک فعال گردید',
            subscription: {
              start_date: startDate,
              start_date_jalali: toJalali(startDate),
              end_date: endDate,
              end_date_jalali: toJalali(endDate),
              duration_months: payment.duration_months
            },
            jalali_date: toJalali(new Date())
          });
        } else {
          res.status(404).json({
            success: false,
            message: 'اطلاعات پرداخت یافت نشد'
          });
        }
      } else {
        // پرداخت ناموفق
        await db.execute(
          'UPDATE payments SET status = "failed" WHERE trackId = ?',
          [trackId]
        );
        
        res.status(400).json({
          success: false,
          message: 'پرداخت ناموفق بود',
          errorCode: verifyResult.result
        });
      }
    } else {
      // پرداخت لغو شده توسط کاربر
      await db.execute(
        'UPDATE payments SET status = "failed" WHERE trackId = ?',
        [trackId]
      );
      
      res.status(400).json({
        success: false,
        message: 'پرداخت توسط کاربر لغو شد'
      });
    }
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در تایید پرداخت'
    });
  }
});

// تاریخچه پرداخت‌های مرکز
router.get('/history', authMiddleware, managerMiddleware, async (req, res) => {
  try {
    const center_id = req.user.center_id;
    
    const query = `
      SELECT p.*, s.plan_name 
      FROM payments p
      LEFT JOIN subscriptions s ON p.subscription_id = s.id
      WHERE p.center_id = ?
      ORDER BY p.created_at DESC
    `;
    
    const [payments] = await db.execute(query, [center_id]);
    
    // تبدیل تاریخ‌ها به شمسی
    const paymentsWithJalali = payments.map(payment => ({
      ...payment,
      created_at_jalali: toJalali(payment.created_at),
      payment_date_jalali: payment.payment_date ? toJalali(payment.payment_date) : null
    }));

    res.json({
      success: true,
      payments: paymentsWithJalali,
      total: payments.length,
      current_jalali_date: toJalali(new Date())
    });
  } catch (err) {
    console.error('Error fetching payment history:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تاریخچه پرداخت‌ها'
    });
  }
});

module.exports = router;