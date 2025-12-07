const express = require('express');
const router = express.Router();
const {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    archiveNotification,
    getPreferences,
    updatePreferences,
    getUnreadCount,
    clearAllNotifications,
    sendTestNotification,
    getNotificationStats
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// User notification routes
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.put('/:id/archive', archiveNotification);
router.delete('/:id', deleteNotification);
router.delete('/clear-all', clearAllNotifications);
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);
router.post('/test', sendTestNotification);

// Admin notification statistics
router.get('/stats', authorize('admin', 'super_admin'), getNotificationStats);

module.exports = router;