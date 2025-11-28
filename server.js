// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const patientRoutes = require('./routes/patients');
const deliveryRoutes = require('./routes/deliveries');
const paymentRoutes = require('./routes/payments');
const reportRoutes = require('./routes/reports');
const financeRoutes = require('./routes/finance');
const drugRoutes = require('./routes/drugs');
const inventoryRoutes = require('./routes/inventory');

// Import middleware
const jalaliMiddleware = require('./middleware/jalali');
const { toJalali } = require('./utils/dateConverter');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3001', 'http://localhost:5173', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(jalaliMiddleware);

// Routes
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/patients', patientRoutes);
app.use('/deliveries', deliveryRoutes);
app.use('/payments', paymentRoutes);
app.use('/reports', reportRoutes);
app.use('/finance', financeRoutes);
app.use('/drugs', drugRoutes);
app.use('/inventory', inventoryRoutes);

// Health check
app.get('/health', async (req, res) => {
  try {
    const db = require('./config/database');
    const [result] = await db.execute('SELECT 1 as test');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      jalali_timestamp: toJalali(new Date())
    });
  } catch (err) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Medita Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    jalali_date: toJalali(new Date())
  });
});

// Patient status update function
const updatePatientStatuses = async () => {
  try {
    const db = require('./config/database');
    const today = new Date();
    
    const updateQuery = `
      UPDATE patients p
      LEFT JOIN (
        SELECT patient_id, MAX(delivery_date_gregorian) as last_delivery
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
    console.log('✅ Patient statuses updated:', toJalali(new Date()));
  } catch (err) {
    console.error('Error updating patient statuses:', err);
  }
};

// Server initialization
async function initializeServer() {
  try {
    const db = require('./config/database');
    const [result] = await db.execute('SELECT 1 as test');
    console.log('✅ Database connected');
    
    await updatePatientStatuses();
    setInterval(updatePatientStatuses, 24 * 60 * 60 * 1000);
    
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
}

// Error handling
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    requested_url: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// Server start
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n🚀 Medita server running on port ${PORT}`);
  console.log('📍 http://localhost:3000');
  console.log('📅', toJalali(new Date()));
  
  await initializeServer();
});

module.exports = app;