const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    // Recipient
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Notification Content
    title: {
        type: String,
        required: [true, 'Notification title is required'],
        trim: true
    },
    message: {
        type: String,
        required: [true, 'Notification message is required'],
        trim: true
    },
    shortMessage: String,
    
    // Notification Type
    type: {
        type: String,
        enum: [
            'booking',      // Booking confirmations, updates
            'payment',      // Payment success/failure
            'offer',        // New offers, promo codes
            'referral',     // Referral updates
            'system',       // System notifications
            'alert',        // Important alerts
            'reminder',     // Reminders
            'promotional'   // Marketing/promotional
        ],
        required: true
    },
    
    // Category
    category: {
        type: String,
        enum: [
            'info',
            'success',
            'warning',
            'error',
            'promotion'
        ],
        default: 'info'
    },
    
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    
    // Metadata
    metadata: {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
        },
        carId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Car'
        },
        offerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Offer'
        },
        paymentId: String,
        amount: Number,
        url: String,        // Deep link URL
        action: String,     // Action text for buttons
        image: String       // Image URL for notification
    },
    
    // Delivery Settings
    channels: [{
        type: String,
        enum: ['in_app', 'email', 'sms', 'push'],
        default: ['in_app']
    }],
    sendEmail: {
        type: Boolean,
        default: false
    },
    sendSMS: {
        type: Boolean,
        default: false
    },
    sendPush: {
        type: Boolean,
        default: false
    },
    
    // Status Tracking
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    isArchived: {
        type: Boolean,
        default: false
    },
    emailSent: {
        type: Boolean,
        default: false
    },
    smsSent: {
        type: Boolean,
        default: false
    },
    pushSent: {
        type: Boolean,
        default: false
    },
    
    // Expiry
    expiresAt: Date,
    
    // Timestamps
    readAt: Date,
    sentAt: Date,
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Indexes for optimized queries
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired

// Pre-save middleware
notificationSchema.pre('save', function(next) {
    // Set expiry date if not set (default 30 days)
    if (!this.expiresAt) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        this.expiresAt = expiryDate;
    }
    
    // Generate short message if not provided
    if (!this.shortMessage && this.message) {
        this.shortMessage = this.message.length > 100 
            ? this.message.substring(0, 100) + '...' 
            : this.message;
    }
    
    next();
});

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
    this.isRead = true;
    this.readAt = new Date();
    return this.save();
};

// Method to mark as unread
notificationSchema.methods.markAsUnread = function() {
    this.isRead = false;
    this.readAt = null;
    return this.save();
};

// Method to archive
notificationSchema.methods.archive = function() {
    this.isArchived = true;
    return this.save();
};

// Method to unarchive
notificationSchema.methods.unarchive = function() {
    this.isArchived = false;
    return this.save();
};

// Static method to get user notifications
notificationSchema.statics.getUserNotifications = async function(userId, options = {}) {
    const { 
        limit = 50, 
        skip = 0, 
        unreadOnly = false,
        archived = false,
        types = []
    } = options;
    
    const query = { 
        user: userId,
        isArchived: archived 
    };
    
    if (unreadOnly) {
        query.isRead = false;
    }
    
    if (types && types.length > 0) {
        query.type = { $in: types };
    }
    
    const notifications = await this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('metadata.bookingId', 'bookingNumber')
        .populate('metadata.carId', 'make model')
        .populate('metadata.offerId', 'title code');
    
    const total = await this.countDocuments(query);
    const unreadCount = await this.countDocuments({ 
        user: userId, 
        isRead: false,
        isArchived: false 
    });
    
    return {
        notifications,
        total,
        unreadCount,
        hasMore: total > skip + limit
    };
};

// Static method to create notification template
notificationSchema.statics.createNotification = async function(userId, data) {
    const {
        title,
        message,
        type = 'system',
        category = 'info',
        priority = 'medium',
        metadata = {},
        channels = ['in_app'],
        sendEmail = false,
        sendSMS = false,
        sendPush = false
    } = data;
    
    const notification = new this({
        user: userId,
        title,
        message,
        type,
        category,
        priority,
        metadata,
        channels,
        sendEmail,
        sendSMS,
        sendPush
    });
    
    await notification.save();
    
    // Trigger email/SMS/push if enabled
    if (sendEmail) {
        await sendNotificationEmail(userId, notification);
    }
    
    if (sendSMS) {
        await sendNotificationSMS(userId, notification);
    }
    
    if (sendPush) {
        await sendPushNotification(userId, notification);
    }
    
    return notification;
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = async function(userId) {
    const result = await this.updateMany(
        { 
            user: userId, 
            isRead: false,
            isArchived: false 
        },
        { 
            $set: { 
                isRead: true,
                readAt: new Date() 
            } 
        }
    );
    
    return result.modifiedCount;
};

// Static method to send bulk notifications
notificationSchema.statics.sendBulkNotification = async function(userIds, data) {
    const notifications = userIds.map(userId => ({
        user: userId,
        title: data.title,
        message: data.message,
        type: data.type || 'system',
        category: data.category || 'info',
        priority: data.priority || 'medium',
        metadata: data.metadata || {},
        channels: data.channels || ['in_app'],
        sendEmail: data.sendEmail || false,
        sendSMS: data.sendSMS || false,
        sendPush: data.sendPush || false
    }));
    
    const created = await this.insertMany(notifications);
    
    // Handle email/SMS/push for bulk if needed
    if (data.sendEmail) {
        // Implement bulk email logic
    }
    
    return created;
};

// Helper functions (to be implemented)
async function sendNotificationEmail(userId, notification) {
    // Implement email sending logic
    const { sendEmail } = require('../utils/emailService');
    const User = require('./User');
    
    const user = await User.findById(userId);
    if (!user) return;
    
    await sendEmail({
        email: user.email,
        subject: notification.title,
        template: 'notification',
        context: {
            userName: user.name,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            metadata: notification.metadata
        }
    });
    
    notification.emailSent = true;
    notification.sentAt = new Date();
    await notification.save();
}

async function sendNotificationSMS(userId, notification) {
    // Implement SMS sending logic
    // This would integrate with Twilio or similar service
}

async function sendPushNotification(userId, notification) {
    // Implement push notification logic
    // This would integrate with Firebase Cloud Messaging
}

module.exports = mongoose.model('Notification', notificationSchema);