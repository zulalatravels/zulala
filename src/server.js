// src/server.js

// Load environment variables
require('dotenv').config({ path: __dirname + '/.env' });

// Core imports
const express = require('express');
const cors = require('cors');

// Database
const connectDB = require('./config/database');

// Error middleware
const errorHandler = require('./middleware/error');

// Connect to DB
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ROUTES (IMPORTANT: keep these)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cars', require('./routes/cars'));
app.use('/api/bookings', require('./routes/bookings'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler (must be last)
app.use(errorHandler);

// Run server
const PORT = process.env.PORT || 5000;
const MODE = process.env.NODE_ENV;

// TEMP LOGS
console.log("MONGO_URI environment value:", process.env.MONGO_URI);

app.listen(PORT, () => {
  console.log(`✅ Server running in ${MODE} mode on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`📧 Email: ${process.env.EMAIL_USERNAME}`);
});
