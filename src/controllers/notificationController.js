const Notification = require('../models/Notification');
const User = require('../models/User');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20,
            unreadOnly,
            type,
            archived 
        } = req.query;

        const options = {
            limit: parseInt(limit),
            skip: (page - 1) * limit,
            unreadOnly: unreadOnly === 'true',
            types: type ? [type] : [],
            archived: archived === 'true'
        };

        const result = await Notification.getUserNotifications(req.user.id, options);

        res.status(200).json({
            success: true,
            data: {
                notifications: result.notifications,
                pagination: {
                    total: result.total,
                    unreadCount: result.unreadCount,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(result.total / limit),
                    hasMore: result.hasMore
                }
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        await notification.markAsRead();

        res.status(200).json({
            success: true,
            data: notification
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
    try {
        const updatedCount = await Notification.markAllAsRead(req.user.id);

        res.status(200).json({
            success: true,
            message: `${updatedCount} notifications marked as read`,
            data: { updatedCount }
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            user: req.user.id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Archive notification
// @route   PUT /api/notifications/:id/archive
// @access  Private
exports.archiveNotification = async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        await notification.archive();

        res.status(200).json({
            success: true,
            data: notification
        });
    } catch (error) {
        console.error('Archive notification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get notification preferences
// @route   GET /api/notifications/preferences
// @access  Private
exports.getPreferences = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('preferences');

        res.status(200).json({
            success: true,
            data: user.preferences || {
                notifications: {
                    email: true,
                    sms: true,
                    push: true
                }
            }
        });
    } catch (error) {
        console.error('Get preferences error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update notification preferences
// @route   PUT /api/notifications/preferences
// @access  Private
exports.updatePreferences = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user.preferences) {
            user.preferences = {
                notifications: {
                    email: true,
                    sms: true,
                    push: true
                }
            };
        }

        // Update preferences
        if (req.body.notifications) {
            user.preferences.notifications = {
                ...user.preferences.notifications,
                ...req.body.notifications
            };
        }

        if (req.body.language) {
            user.preferences.language = req.body.language;
        }

        if (req.body.currency) {
            user.preferences.currency = req.body.currency;
        }

        await user.save();

        res.status(200).json({
            success: true,
            data: user.preferences
        });
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
exports.getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            user: req.user.id,
            isRead: false,
            isArchived: false
        });

        res.status(200).json({
            success: true,
            data: { count }
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Clear all notifications
// @route   DELETE /api/notifications/clear-all
// @access  Private
exports.clearAllNotifications = async (req, res) => {
    try {
        const result = await Notification.deleteMany({
            user: req.user.id,
            isArchived: false
        });

        res.status(200).json({
            success: true,
            message: `Cleared ${result.deletedCount} notifications`,
            data: { deletedCount: result.deletedCount }
        });
    } catch (error) {
        console.error('Clear all notifications error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Send test notification
// @route   POST /api/notifications/test
// @access  Private
exports.sendTestNotification = async (req, res) => {
    try {
        const { type, channel } = req.body;

        const notification = await Notification.createNotification(
            req.user.id,
            {
                title: 'Test Notification',
                message: 'This is a test notification to verify your notification settings.',
                type: type || 'system',
                category: 'info',
                priority: 'low',
                channels: channel ? [channel] : ['in_app'],
                sendEmail: channel === 'email',
                sendSMS: channel === 'sms',
                sendPush: channel === 'push'
            }
        );

        res.status(200).json({
            success: true,
            message: 'Test notification sent successfully',
            data: notification
        });
    } catch (error) {
        console.error('Send test notification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get notification statistics
// @route   GET /api/notifications/stats
// @access  Private/Admin
exports.getNotificationStats = async (req, res) => {
    try {
        const stats = await Notification.aggregate([
            {
                $group: {
                    _id: {
                        type: '$type',
                        channel: { $arrayElemAt: ['$channels', 0] }
                    },
                    total: { $sum: 1 },
                    read: { $sum: { $cond: ['$isRead', 1, 0] } },
                    emailSent: { $sum: { $cond: ['$emailSent', 1, 0] } },
                    smsSent: { $sum: { $cond: ['$smsSent', 1, 0] } }
                }
            },
            {
                $group: {
                    _id: '$_id.type',
                    total: { $sum: '$total' },
                    read: { $sum: '$read' },
                    emailSent: { $sum: '$emailSent' },
                    smsSent: { $sum: '$smsSent' },
                    channels: {
                        $push: {
                            channel: '$_id.channel',
                            count: '$total'
                        }
                    }
                }
            },
            {
                $project: {
                    type: '$_id',
                    total: 1,
                    read: 1,
                    readRate: {
                        $cond: [
                            { $eq: ['$total', 0] },
                            0,
                            { $multiply: [{ $divide: ['$read', '$total'] }, 100] }
                        ]
                    },
                    emailSent: 1,
                    smsSent: 1,
                    channels: 1
                }
            },
            { $sort: { total: -1 } }
        ]);

        // Get daily notification trend (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyTrend = await Notification.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        type: '$type'
                    },
                    count: { $sum: 1 },
                    read: { $sum: { $cond: ['$isRead', 1, 0] } }
                }
            },
            {
                $group: {
                    _id: '$_id.date',
                    total: { $sum: '$count' },
                    read: { $sum: '$read' },
                    types: {
                        $push: {
                            type: '$_id.type',
                            count: '$count'
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                stats,
                dailyTrend,
                summary: {
                    totalNotifications: stats.reduce((sum, stat) => sum + stat.total, 0),
                    avgReadRate: stats.length > 0 ? 
                        stats.reduce((sum, stat) => sum + stat.readRate, 0) / stats.length : 0,
                    totalEmailSent: stats.reduce((sum, stat) => sum + stat.emailSent, 0),
                    totalSMSSent: stats.reduce((sum, stat) => sum + stat.smsSent, 0)
                }
            }
        });
    } catch (error) {
        console.error('Get notification stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};