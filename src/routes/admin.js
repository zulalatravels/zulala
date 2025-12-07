const express = require('express');
const router = express.Router();
const {
    getDashboardStats,
    getAllUsers,
    getUserDetails,
    updateUser,
    deleteUser,
    getSystemLogs,
    sendBulkNotification,
    getSystemSettings,
    updateSystemSettings,
    exportData,
    getMaintenanceTasks,
    getReports
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// All admin routes require authentication and admin role
router.use(protect);
router.use(authorize('admin', 'super_admin'));

// Dashboard
router.get('/dashboard', getDashboardStats);

// User management
router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetails);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// System management
router.get('/logs', getSystemLogs);
router.post('/notifications/bulk', sendBulkNotification);
router.get('/settings', getSystemSettings);
router.put('/settings', updateSystemSettings);
router.post('/export', exportData);
router.get('/maintenance', getMaintenanceTasks);
router.get('/reports', getReports);

module.exports = router;