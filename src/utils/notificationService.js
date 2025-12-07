const Notification = require('../models/Notification');

exports.sendNotification = async (userId, title, message, type = 'system', metadata = {}) => {
    try {
        const notification = await Notification.create({
            user: userId,
            title,
            message,
            type,
            metadata
        });

        // Here you can integrate with WebSocket for real-time notifications
        return notification;
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};

exports.sendBulkNotification = async (userIds, title, message, type = 'system') => {
    try {
        const notifications = userIds.map(userId => ({
            user: userId,
            title,
            message,
            type,
            isRead: false
        }));

        await Notification.insertMany(notifications);
    } catch (error) {
        console.error('Error sending bulk notifications:', error);
    }
};