const User = require('../models/User');
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const Offer = require('../models/Offer');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
    try {
        // Get all statistics in parallel for better performance
        const [
            userStats,
            carStats,
            bookingStats,
            recentBookings,
            recentUsers,
            revenueStats,
            popularCars,
            activeOffers
        ] = await Promise.all([
            // User statistics
            User.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        activeUsers: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                        newUsersToday: {
                            $sum: {
                                $cond: [{
                                    $gte: ['$createdAt', new Date(new Date().setHours(0, 0, 0, 0))]
                                }, 1, 0]
                            }
                        },
                        verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } },
                        totalWalletBalance: { $sum: '$walletBalance' }
                    }
                }
            ]),

            // Car statistics
            Car.aggregate([
                {
                    $group: {
                        _id: null,
                        totalCars: { $sum: 1 },
                        availableCars: {
                            $sum: { $cond: [{ $eq: ['$availability', 'available'] }, 1, 0] }
                        },
                        bookedCars: {
                            $sum: { $cond: [{ $eq: ['$availability', 'booked'] }, 1, 0] }
                        },
                        underMaintenance: {
                            $sum: { $cond: [{ $eq: ['$availability', 'maintenance'] }, 1, 0] }
                        },
                        featuredCars: { $sum: { $cond: ['$isFeatured', 1, 0] } }
                    }
                }
            ]),

            // Booking statistics
            Booking.aggregate([
                {
                    $group: {
                        _id: null,
                        totalBookings: { $sum: 1 },
                        pendingBookings: {
                            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                        },
                        confirmedBookings: {
                            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
                        },
                        activeBookings: {
                            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                        },
                        completedBookings: {
                            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                        },
                        cancelledBookings: {
                            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                        }
                    }
                }
            ]),

            // Recent bookings (last 10)
            Booking.find()
                .populate('user', 'name email')
                .populate('car', 'make model')
                .sort('-createdAt')
                .limit(10),

            // Recent users (last 10)
            User.find()
                .select('name email createdAt status')
                .sort('-createdAt')
                .limit(10),

            // Revenue statistics (last 30 days)
            Booking.aggregate([
                {
                    $match: {
                        status: 'completed',
                        createdAt: {
                            $gte: new Date(new Date().setDate(new Date().getDate() - 30))
                        }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                            day: { $dayOfMonth: '$createdAt' }
                        },
                        dailyRevenue: { $sum: '$totalAmount' },
                        bookingsCount: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
            ]),

            // Popular cars (by bookings)
            Booking.aggregate([
                {
                    $match: {
                        status: { $in: ['completed', 'active'] }
                    }
                },
                {
                    $group: {
                        _id: '$car',
                        bookingsCount: { $sum: 1 },
                        totalRevenue: { $sum: '$totalAmount' }
                    }
                },
                { $sort: { bookingsCount: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'cars',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'carDetails'
                    }
                },
                { $unwind: '$carDetails' },
                {
                    $project: {
                        carId: '$_id',
                        carName: { $concat: ['$carDetails.make', ' ', '$carDetails.model'] },
                        bookingsCount: 1,
                        totalRevenue: 1,
                        image: { $arrayElemAt: ['$carDetails.images.url', 0] }
                    }
                }
            ]),

            // Active offers
            Offer.find({
                status: 'active',
                validFrom: { $lte: new Date() },
                validUntil: { $gte: new Date() }
            })
            .sort('-displayPriority')
            .limit(5)
        ]);

        // Calculate today's revenue
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const todayRevenue = await Booking.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: {
                        $gte: todayStart,
                        $lte: todayEnd
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    revenue: { $sum: '$totalAmount' },
                    bookings: { $sum: 1 }
                }
            }
        ]);

        // Calculate monthly revenue
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const monthlyRevenue = await Booking.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: { $gte: monthStart }
                }
            },
            {
                $group: {
                    _id: null,
                    revenue: { $sum: '$totalAmount' },
                    bookings: { $sum: 1 }
                }
            }
        ]);

        // Pending actions
        const pendingActions = {
            pendingBookings: await Booking.countDocuments({ status: 'pending' }),
            pendingReviews: await Booking.countDocuments({ 
                status: 'completed',
                review: { $exists: false }
            }),
            carsNeedingMaintenance: await Car.countDocuments({
                'maintenance.nextService': { $lte: new Date() }
            }),
            extensionRequests: await Booking.countDocuments({
                'extensionRequests.status': 'pending'
            })
        };

        res.status(200).json({
            success: true,
            data: {
                userStats: userStats[0] || {},
                carStats: carStats[0] || {},
                bookingStats: bookingStats[0] || {},
                recentBookings,
                recentUsers,
                revenueStats,
                popularCars,
                activeOffers,
                todayRevenue: todayRevenue[0] || { revenue: 0, bookings: 0 },
                monthlyRevenue: monthlyRevenue[0] || { revenue: 0, bookings: 0 },
                pendingActions
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get all users with filters
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getAllUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            status,
            role,
            verified,
            sortBy = '-createdAt'
        } = req.query;

        const query = {};

        // Search functionality
        if (search) {
            query.$or = [
                { name: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') },
                { referralCode: new RegExp(search, 'i') }
            ];
        }

        // Filter by status
        if (status) {
            query.status = status;
        }

        // Filter by role
        if (role) {
            query.role = role;
        }

        // Filter by verification status
        if (verified !== undefined) {
            query.isVerified = verified === 'true';
        }

        const users = await User.find(query)
            .select('-password')
            .sort(sortBy)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        // Get user statistics
        const stats = await User.getDashboardStats();

        res.status(200).json({
            success: true,
            count: users.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            stats,
            data: users
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get user details
// @route   GET /api/admin/users/:id
// @access  Private/Admin
exports.getUserDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .populate('referredBy', 'name email');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get user's bookings
        const bookings = await Booking.find({ user: user._id })
            .populate('car', 'make model licensePlate')
            .sort('-createdAt')
            .limit(20);

        // Get referral details
        const referrals = await require('../models/Referral').find({ referrer: user._id })
            .populate('referredUser', 'name email createdAt')
            .sort('-createdAt');

        // Get wallet transactions
        const transactions = await require('../models/Transaction').find({
            user: user._id
        })
        .sort('-createdAt')
        .limit(20);

        res.status(200).json({
            success: true,
            data: {
                user,
                bookings: {
                    total: bookings.length,
                    list: bookings
                },
                referrals: {
                    total: referrals.length,
                    list: referrals
                },
                transactions: {
                    total: transactions.length,
                    list: transactions
                },
                stats: {
                    totalBookings: await Booking.countDocuments({ user: user._id }),
                    totalSpent: user.totalSpent,
                    walletBalance: user.walletBalance,
                    referralPoints: user.referralPoints
                }
            }
        });
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update user (admin)
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Prevent modifying super admin
        if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Cannot modify super admin user'
            });
        }

        const allowedUpdates = [
            'name', 'email', 'phone', 'address', 'status',
            'role', 'walletBalance', 'driverLicense'
        ];

        const updates = {};
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updates[key] = req.body[key];
            }
        });

        // If role is being changed
        if (updates.role && updates.role !== user.role) {
            // Only super admin can assign admin role
            if (updates.role === 'admin' && req.user.role !== 'super_admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Only super admin can assign admin role'
                });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            updates,
            {
                new: true,
                runValidators: true
            }
        ).select('-password');

        // Log the action
        await require('../models/AuditLog').create({
            action: 'UPDATE_USER',
            performedBy: req.user.id,
            targetUser: user._id,
            changes: updates,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Send notification to user if status changed
        if (updates.status && updates.status !== user.status) {
            await Notification.create({
                user: user._id,
                title: 'Account Status Updated',
                message: `Your account status has been updated to ${updates.status}`,
                type: 'system',
                sendEmail: true
            });
        }

        res.status(200).json({
            success: true,
            data: updatedUser
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Delete user (admin)
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Prevent deleting super admin
        if (user.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Cannot delete super admin user'
            });
        }

        // Check if user has active bookings
        const activeBookings = await Booking.countDocuments({
            user: user._id,
            status: { $in: ['confirmed', 'active', 'pending'] }
        });

        if (activeBookings > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete user with active bookings'
            });
        }

        // Soft delete by changing status
        user.status = 'deactivated';
        await user.save();

        // Log the action
        await require('../models/AuditLog').create({
            action: 'DELETE_USER',
            performedBy: req.user.id,
            targetUser: user._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get system logs
// @route   GET /api/admin/logs
// @access  Private/Admin
exports.getSystemLogs = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50,
            action,
            startDate,
            endDate,
            userId 
        } = req.query;

        const query = {};

        if (action) {
            query.action = action;
        }

        if (userId) {
            query.$or = [
                { performedBy: userId },
                { targetUser: userId }
            ];
        }

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        const AuditLog = require('../models/AuditLog');
        
        const logs = await AuditLog.find(query)
            .populate('performedBy', 'name email')
            .populate('targetUser', 'name email')
            .sort('-timestamp')
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await AuditLog.countDocuments(query);

        // Get log statistics
        const stats = await AuditLog.aggregate([
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.status(200).json({
            success: true,
            count: logs.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            stats,
            data: logs
        });
    } catch (error) {
        console.error('Get system logs error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Send bulk notification
// @route   POST /api/admin/notifications/bulk
// @access  Private/Admin
exports.sendBulkNotification = async (req, res) => {
    try {
        const { 
            title, 
            message, 
            type, 
            userType, 
            specificUsers,
            sendEmail,
            sendSMS 
        } = req.body;

        // Determine target users
        let targetUsers = [];

        if (userType === 'all') {
            targetUsers = await User.find({ status: 'active' }).select('_id');
        } else if (userType === 'verified') {
            targetUsers = await User.find({ 
                status: 'active',
                isVerified: true 
            }).select('_id');
        } else if (userType === 'with_bookings') {
            targetUsers = await User.find({ 
                status: 'active',
                totalBookings: { $gt: 0 }
            }).select('_id');
        } else if (userType === 'specific' && specificUsers) {
            targetUsers = await User.find({
                _id: { $in: specificUsers },
                status: 'active'
            }).select('_id');
        }

        const userIds = targetUsers.map(user => user._id);

        if (userIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No users found for notification'
            });
        }

        // Send bulk notification
        const Notification = require('../models/Notification');
        const sentNotifications = await Notification.sendBulkNotification(
            userIds,
            {
                title,
                message,
                type: type || 'system',
                category: 'info',
                priority: 'medium',
                sendEmail: sendEmail || false,
                sendSMS: sendSMS || false,
                sendPush: false
            }
        );

        // Log the action
        await require('../models/AuditLog').create({
            action: 'BULK_NOTIFICATION',
            performedBy: req.user.id,
            details: {
                title,
                message,
                userType,
                recipientCount: userIds.length,
                sendEmail,
                sendSMS
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(200).json({
            success: true,
            message: `Notification sent to ${sentNotifications.length} users`,
            data: {
                sentCount: sentNotifications.length,
                userIds
            }
        });
    } catch (error) {
        console.error('Send bulk notification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get system settings
// @route   GET /api/admin/settings
// @access  Private/Admin
exports.getSystemSettings = async (req, res) => {
    try {
        const SystemSetting = require('../models/SystemSetting');
        
        const settings = await SystemSetting.findOne() || new SystemSetting();

        res.status(200).json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Get system settings error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update system settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
exports.updateSystemSettings = async (req, res) => {
    try {
        const SystemSetting = require('../models/SystemSetting');
        
        let settings = await SystemSetting.findOne();
        
        if (!settings) {
            settings = new SystemSetting();
        }

        // Update settings
        Object.keys(req.body).forEach(key => {
            if (settings[key] !== undefined) {
                settings[key] = req.body[key];
            }
        });

        settings.updatedBy = req.user.id;
        settings.updatedAt = new Date();

        await settings.save();

        // Log the action
        await require('../models/AuditLog').create({
            action: 'UPDATE_SETTINGS',
            performedBy: req.user.id,
            changes: req.body,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(200).json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Update system settings error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Export data
// @route   POST /api/admin/export
// @access  Private/Admin
exports.exportData = async (req, res) => {
    try {
        const { dataType, format, startDate, endDate } = req.body;

        let data;
        let filename;
        const workbook = new (require('exceljs')).Workbook();

        switch (dataType) {
            case 'users':
                const users = await User.find({
                    createdAt: {
                        $gte: new Date(startDate),
                        $lte: new Date(endDate)
                    }
                }).select('-password');

                if (format === 'excel') {
                    const worksheet = workbook.addWorksheet('Users');
                    
                    // Add headers
                    worksheet.columns = [
                        { header: 'ID', key: '_id', width: 30 },
                        { header: 'Name', key: 'name', width: 25 },
                        { header: 'Email', key: 'email', width: 30 },
                        { header: 'Phone', key: 'phone', width: 15 },
                        { header: 'Role', key: 'role', width: 10 },
                        { header: 'Status', key: 'status', width: 10 },
                        { header: 'Verified', key: 'isVerified', width: 10 },
                        { header: 'Wallet Balance', key: 'walletBalance', width: 15 },
                        { header: 'Total Spent', key: 'totalSpent', width: 15 },
                        { header: 'Joined Date', key: 'createdAt', width: 20 }
                    ];

                    // Add data
                    users.forEach(user => {
                        worksheet.addRow({
                            _id: user._id,
                            name: user.name,
                            email: user.email,
                            phone: user.phone,
                            role: user.role,
                            status: user.status,
                            isVerified: user.isVerified ? 'Yes' : 'No',
                            walletBalance: user.walletBalance,
                            totalSpent: user.totalSpent,
                            createdAt: user.createdAt.toLocaleDateString()
                        });
                    });

                    filename = `users_export_${Date.now()}.xlsx`;
                }
                data = users;
                break;

            case 'bookings':
                const bookings = await Booking.find({
                    createdAt: {
                        $gte: new Date(startDate),
                        $lte: new Date(endDate)
                    }
                })
                .populate('user', 'name email')
                .populate('car', 'make model licensePlate');

                if (format === 'excel') {
                    const worksheet = workbook.addWorksheet('Bookings');
                    
                    worksheet.columns = [
                        { header: 'Booking ID', key: 'bookingNumber', width: 20 },
                        { header: 'User', key: 'userName', width: 25 },
                        { header: 'Car', key: 'carDetails', width: 25 },
                        { header: 'Pickup Date', key: 'pickupDate', width: 15 },
                        { header: 'Dropoff Date', key: 'dropoffDate', width: 15 },
                        { header: 'Total Days', key: 'totalDays', width: 10 },
                        { header: 'Amount', key: 'totalAmount', width: 15 },
                        { header: 'Status', key: 'status', width: 12 },
                        { header: 'Payment Status', key: 'paymentStatus', width: 15 },
                        { header: 'Created At', key: 'createdAt', width: 20 }
                    ];

                    bookings.forEach(booking => {
                        worksheet.addRow({
                            bookingNumber: booking.bookingNumber,
                            userName: booking.user?.name || 'N/A',
                            carDetails: `${booking.car?.make} ${booking.car?.model}`,
                            pickupDate: booking.pickupDate.toLocaleDateString(),
                            dropoffDate: booking.dropoffDate.toLocaleDateString(),
                            totalDays: booking.totalDays,
                            totalAmount: booking.totalAmount,
                            status: booking.status,
                            paymentStatus: booking.payment.status,
                            createdAt: booking.createdAt.toLocaleDateString()
                        });
                    });

                    filename = `bookings_export_${Date.now()}.xlsx`;
                }
                data = bookings;
                break;

            case 'cars':
                const cars = await Car.find({
                    createdAt: {
                        $gte: new Date(startDate),
                        $lte: new Date(endDate)
                    }
                });

                if (format === 'excel') {
                    const worksheet = workbook.addWorksheet('Cars');
                    
                    worksheet.columns = [
                        { header: 'Make', key: 'make', width: 15 },
                        { header: 'Model', key: 'model', width: 15 },
                        { header: 'License Plate', key: 'licensePlate', width: 15 },
                        { header: 'Category', key: 'category', width: 15 },
                        { header: 'Price/Day', key: 'pricePerDay', width: 12 },
                        { header: 'Status', key: 'status', width: 10 },
                        { header: 'Availability', key: 'availability', width: 15 },
                        { header: 'Total Bookings', key: 'totalBookings', width: 15 },
                        { header: 'Total Revenue', key: 'totalRevenue', width: 15 },
                        { header: 'Rating', key: 'rating', width: 10 }
                    ];

                    cars.forEach(car => {
                        worksheet.addRow({
                            make: car.make,
                            model: car.model,
                            licensePlate: car.licensePlate,
                            category: car.category,
                            pricePerDay: car.pricePerDay,
                            status: car.status,
                            availability: car.availability,
                            totalBookings: car.totalBookings,
                            totalRevenue: car.totalRevenue,
                            rating: car.rating.average.toFixed(1)
                        });
                    });

                    filename = `cars_export_${Date.now()}.xlsx`;
                }
                data = cars;
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid data type'
                });
        }

        if (format === 'excel') {
            // Write to buffer
            const buffer = await workbook.xlsx.writeBuffer();
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            return res.send(buffer);
        } else {
            // JSON format
            res.status(200).json({
                success: true,
                data: {
                    type: dataType,
                    count: data.length,
                    records: data
                }
            });
        }

    } catch (error) {
        console.error('Export data error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get maintenance tasks
// @route   GET /api/admin/maintenance
// @access  Private/Admin
exports.getMaintenanceTasks = async (req, res) => {
    try {
        // Cars needing maintenance
        const carsNeedingMaintenance = await Car.find({
            'maintenance.nextService': { $lte: new Date() }
        })
        .select('make model licensePlate maintenance.nextService maintenance.lastService');

        // Cars with high mileage
        const highMileageCars = await Car.find({
            'maintenance.currentMileage': { $gte: 50000 }
        })
        .select('make model licensePlate maintenance.currentMileage');

        // Insurance expiring soon
        const insuranceExpiring = await Car.find({
            'insurance.validUntil': {
                $gte: new Date(),
                $lte: new Date(new Date().setDate(new Date().getDate() + 30))
            }
        })
        .select('make model licensePlate insurance.validUntil insurance.provider');

        // Pollution certificate expiring
        const pollutionExpiring = await Car.find({
            'pollutionCertificate.validUntil': {
                $gte: new Date(),
                $lte: new Date(new Date().setDate(new Date().getDate() + 30))
            }
        })
        .select('make model licensePlate pollutionCertificate.validUntil');

        res.status(200).json({
            success: true,
            data: {
                carsNeedingMaintenance,
                highMileageCars,
                insuranceExpiring,
                pollutionExpiring,
                summary: {
                    maintenanceDue: carsNeedingMaintenance.length,
                    highMileage: highMileageCars.length,
                    insuranceDue: insuranceExpiring.length,
                    pollutionDue: pollutionExpiring.length
                }
            }
        });
    } catch (error) {
        console.error('Get maintenance tasks error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get reports
// @route   GET /api/admin/reports
// @access  Private/Admin
exports.getReports = async (req, res) => {
    try {
        const { reportType, startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
        const end = endDate ? new Date(endDate) : new Date();

        let report;

        switch (reportType) {
            case 'revenue':
                report = await generateRevenueReport(start, end);
                break;
            case 'bookings':
                report = await generateBookingReport(start, end);
                break;
            case 'users':
                report = await generateUserReport(start, end);
                break;
            case 'cars':
                report = await generateCarReport(start, end);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid report type'
                });
        }

        res.status(200).json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Helper functions for reports
async function generateRevenueReport(startDate, endDate) {
    const dailyRevenue = await Booking.aggregate([
        {
            $match: {
                status: 'completed',
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                    day: { $dayOfMonth: '$createdAt' }
                },
                revenue: { $sum: '$totalAmount' },
                bookings: { $sum: 1 },
                avgBookingValue: { $avg: '$totalAmount' }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    const categoryRevenue = await Booking.aggregate([
        {
            $match: {
                status: 'completed',
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $lookup: {
                from: 'cars',
                localField: 'car',
                foreignField: '_id',
                as: 'carDetails'
            }
        },
        { $unwind: '$carDetails' },
        {
            $group: {
                _id: '$carDetails.category',
                revenue: { $sum: '$totalAmount' },
                bookings: { $sum: 1 },
                avgDailyRate: { $avg: '$carDetails.pricePerDay' }
            }
        },
        { $sort: { revenue: -1 } }
    ]);

    const paymentMethodStats = await Booking.aggregate([
        {
            $match: {
                status: 'completed',
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: '$payment.method',
                revenue: { $sum: '$totalAmount' },
                bookings: { $sum: 1 }
            }
        },
        { $sort: { revenue: -1 } }
    ]);

    return {
        period: { startDate, endDate },
        summary: {
            totalRevenue: dailyRevenue.reduce((sum, day) => sum + day.revenue, 0),
            totalBookings: dailyRevenue.reduce((sum, day) => sum + day.bookings, 0),
            avgDailyRevenue: dailyRevenue.length > 0 ? 
                dailyRevenue.reduce((sum, day) => sum + day.revenue, 0) / dailyRevenue.length : 0
        },
        dailyRevenue,
        categoryRevenue,
        paymentMethodStats
    };
}

async function generateBookingReport(startDate, endDate) {
    const bookings = await Booking.find({
        createdAt: { $gte: startDate, $lte: endDate }
    })
    .populate('user', 'name email')
    .populate('car', 'make model category');

    const statusDistribution = await Booking.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$totalAmount' }
            }
        }
    ]);

    const cancellationAnalysis = await Booking.aggregate([
        {
            $match: {
                status: 'cancelled',
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$cancellation.cancelledAt' }
                },
                count: { $sum: 1 },
                totalRefund: { $sum: '$cancellation.refundAmount' }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return {
        period: { startDate, endDate },
        summary: {
            totalBookings: bookings.length,
            completedBookings: statusDistribution.find(s => s._id === 'completed')?.count || 0,
            cancelledBookings: statusDistribution.find(s => s._id === 'cancelled')?.count || 0,
            conversionRate: bookings.length > 0 ? 
                ((statusDistribution.find(s => s._id === 'completed')?.count || 0) / bookings.length * 100).toFixed(2) : 0
        },
        statusDistribution,
        cancellationAnalysis,
        bookings: bookings.slice(0, 100) // Limit to 100 records
    };
}