const Offer = require('../models/Offer');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');

// @desc    Get all offers
// @route   GET /api/offers
// @access  Public
exports.getOffers = async (req, res) => {
    try {
        const { 
            status, 
            type, 
            featured, 
            active,
            page = 1, 
            limit = 10 
        } = req.query;

        const query = {};

        // Filter by status
        if (status) {
            query.status = status;
        }

        // Filter by type
        if (type) {
            query.type = type;
        }

        // Filter by featured
        if (featured === 'true') {
            query.isFeatured = true;
        }

        // Filter active offers (valid now)
        if (active === 'true') {
            const now = new Date();
            query.validFrom = { $lte: now };
            query.validUntil = { $gte: now };
            query.status = 'active';
        }

        const offers = await Offer.find(query)
            .sort({ displayPriority: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Offer.countDocuments(query);

        res.status(200).json({
            success: true,
            count: offers.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: offers
        });
    } catch (error) {
        console.error('Get offers error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get single offer
// @route   GET /api/offers/:id
// @access  Public
exports.getOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Offer not found'
            });
        }

        res.status(200).json({
            success: true,
            data: offer
        });
    } catch (error) {
        console.error('Get offer error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Create new offer
// @route   POST /api/offers
// @access  Private/Admin
exports.createOffer = async (req, res) => {
    try {
        // Add createdBy
        req.body.createdBy = req.user.id;

        // Generate code if not provided
        if (!req.body.code) {
            req.body.code = generateOfferCode();
        }

        // Convert string dates to Date objects
        if (req.body.validFrom) {
            req.body.validFrom = new Date(req.body.validFrom);
        }
        if (req.body.validUntil) {
            req.body.validUntil = new Date(req.body.validUntil);
        }

        // Parse applicable users if provided as string
        if (req.body.specificUsers && typeof req.body.specificUsers === 'string') {
            req.body.specificUsers = JSON.parse(req.body.specificUsers);
        }

        // Parse applicable cars if provided as string
        if (req.body.applicableCars && typeof req.body.applicableCars === 'string') {
            req.body.applicableCars = JSON.parse(req.body.applicableCars);
        }

        // Parse excluded cars if provided as string
        if (req.body.excludedCars && typeof req.body.excludedCars === 'string') {
            req.body.excludedCars = JSON.parse(req.body.excludedCars);
        }

        // Parse active days if provided as string
        if (req.body.activeDays && typeof req.body.activeDays === 'string') {
            req.body.activeDays = JSON.parse(req.body.activeDays);
        }

        const offer = await Offer.create(req.body);

        // Send notification to applicable users if needed
        if (offer.applicableFor === 'all' || offer.applicableFor === 'existing_users') {
            // Get all active users
            const User = require('../models/User');
            const users = await User.find({ status: 'active', isVerified: true }).select('_id');
            
            if (users.length > 0) {
                const userIds = users.map(user => user._id);
                
                // Send bulk notification
                await Notification.sendBulkNotification(
                    userIds,
                    {
                        title: 'New Offer Available!',
                        message: offer.title,
                        type: 'offer',
                        metadata: {
                            offerId: offer._id,
                            code: offer.code
                        }
                    }
                );
            }
        }

        // Log action
        await require('../models/AuditLog').create({
            action: 'CREATE_OFFER',
            performedBy: req.user.id,
            details: {
                offerId: offer._id,
                code: offer.code,
                title: offer.title
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(201).json({
            success: true,
            data: offer
        });
    } catch (error) {
        console.error('Create offer error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update offer
// @route   PUT /api/offers/:id
// @access  Private/Admin
exports.updateOffer = async (req, res) => {
    try {
        let offer = await Offer.findById(req.params.id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Offer not found'
            });
        }

        // Add updatedBy
        req.body.updatedBy = req.user.id;
        req.body.updatedAt = new Date();

        // Convert string dates to Date objects
        if (req.body.validFrom && typeof req.body.validFrom === 'string') {
            req.body.validFrom = new Date(req.body.validFrom);
        }
        if (req.body.validUntil && typeof req.body.validUntil === 'string') {
            req.body.validUntil = new Date(req.body.validUntil);
        }

        offer = await Offer.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Log action
        await require('../models/AuditLog').create({
            action: 'UPDATE_OFFER',
            performedBy: req.user.id,
            targetId: offer._id,
            changes: req.body,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(200).json({
            success: true,
            data: offer
        });
    } catch (error) {
        console.error('Update offer error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Delete offer
// @route   DELETE /api/offers/:id
// @access  Private/Admin
exports.deleteOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Offer not found'
            });
        }

        // Check if offer has been used
        if (offer.usedCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete offer that has been used'
            });
        }

        await offer.deleteOne();

        // Log action
        await require('../models/AuditLog').create({
            action: 'DELETE_OFFER',
            performedBy: req.user.id,
            targetId: offer._id,
            details: {
                code: offer.code,
                title: offer.title
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Delete offer error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Validate offer code
// @route   POST /api/offers/validate
// @access  Private
exports.validateOffer = async (req, res) => {
    try {
        const { code, carId, totalAmount, totalDays, userId } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Offer code is required'
            });
        }

        const offer = await Offer.findOne({ 
            code: code.toUpperCase(),
            status: 'active'
        });

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Invalid offer code'
            });
        }

        // Check offer validity
        const now = new Date();
        if (offer.validFrom > now || offer.validUntil < now) {
            return res.status(400).json({
                success: false,
                error: 'Offer is not valid at this time'
            });
        }

        // Check usage limit
        if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
            return res.status(400).json({
                success: false,
                error: 'Offer usage limit reached'
            });
        }

        // Get car details if carId provided
        let car = null;
        if (carId) {
            car = await require('../models/Car').findById(carId);
        }

        // Get user details if userId provided
        let user = null;
        if (userId) {
            user = await require('../models/User').findById(userId);
        }

        // Check eligibility
        const eligibility = offer.canApplyToBooking({
            totalAmount,
            totalDays,
            carId,
            category: car?.category,
            userId
        });

        if (!eligibility.valid) {
            return res.status(400).json({
                success: false,
                error: eligibility.reason
            });
        }

        // Check per user limit
        if (offer.perUserLimit > 0 && user) {
            const userUsageCount = offer.usersUsed.filter(
                usage => usage.user.toString() === userId
            ).length;

            if (userUsageCount >= offer.perUserLimit) {
                return res.status(400).json({
                    success: false,
                    error: 'You have already used this offer maximum times'
                });
            }
        }

        // Calculate discount
        const discount = offer.calculateDiscount(totalAmount);

        res.status(200).json({
            success: true,
            data: {
                offer: {
                    id: offer._id,
                    title: offer.title,
                    code: offer.code,
                    type: offer.type,
                    discountValue: offer.discountValue
                },
                discountAmount: discount,
                eligibility,
                terms: offer.terms
            }
        });
    } catch (error) {
        console.error('Validate offer error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get offer usage statistics
// @route   GET /api/offers/:id/usage
// @access  Private/Admin
exports.getOfferUsage = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id)
            .populate('usersUsed.user', 'name email')
            .populate('usersUsed.booking');

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Offer not found'
            });
        }

        // Get bookings that used this offer
        const bookings = await Booking.find({
            promoCode: offer.code
        })
        .populate('user', 'name email')
        .populate('car', 'make model')
        .sort('-createdAt');

        // Calculate statistics
        const totalDiscountGiven = bookings.reduce((sum, booking) => 
            sum + (booking.discountAmount || 0), 0
        );

        const totalRevenueFromOffer = bookings.reduce((sum, booking) => 
            sum + booking.totalAmount, 0
        );

        // User usage distribution
        const userUsage = {};
        offer.usersUsed.forEach(usage => {
            const userId = usage.user?._id?.toString();
            if (userId) {
                if (!userUsage[userId]) {
                    userUsage[userId] = {
                        user: usage.user,
                        count: 0,
                        totalDiscount: 0
                    };
                }
                userUsage[userId].count += 1;
                
                // Find booking discount
                const booking = bookings.find(b => b._id.toString() === usage.booking?._id?.toString());
                if (booking) {
                    userUsage[userId].totalDiscount += booking.discountAmount || 0;
                }
            }
        });

        res.status(200).json({
            success: true,
            data: {
                offer: {
                    id: offer._id,
                    title: offer.title,
                    code: offer.code,
                    usedCount: offer.usedCount,
                    usageLimit: offer.usageLimit,
                    status: offer.status
                },
                statistics: {
                    totalUsage: offer.usedCount,
                    totalDiscountGiven,
                    totalRevenueGenerated: totalRevenueFromOffer,
                    conversionRate: bookings.length > 0 ? 
                        (bookings.filter(b => b.status === 'completed').length / bookings.length * 100).toFixed(2) : 0,
                    avgDiscountPerBooking: offer.usedCount > 0 ? 
                        totalDiscountGiven / offer.usedCount : 0
                },
                bookings: {
                    total: bookings.length,
                    list: bookings.slice(0, 50) // Limit to 50 records
                },
                userUsage: Object.values(userUsage),
                usersUsed: offer.usersUsed
            }
        });
    } catch (error) {
        console.error('Get offer usage error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get active offers for user
// @route   GET /api/offers/user/active
// @access  Private
exports.getUserOffers = async (req, res) => {
    try {
        const user = await require('../models/User').findById(req.user.id);
        
        const now = new Date();
        const query = {
            status: 'active',
            validFrom: { $lte: now },
            validUntil: { $gte: now }
        };

        // Get all active offers
        const allOffers = await Offer.find(query)
            .sort({ displayPriority: -1, createdAt: -1 });

        // Filter offers applicable to user
        const applicableOffers = allOffers.filter(offer => {
            // Check user eligibility
            return offer.isUserEligible(user);
        });

        // Get user's booking history for personalized offers
        const userBookings = await Booking.countDocuments({ user: user._id });
        const userTotalSpent = user.totalSpent;

        // Add personalized offers based on user behavior
        const personalizedOffers = [];

        // First booking offer (if user has no bookings)
        if (userBookings === 0) {
            personalizedOffers.push({
                title: 'Welcome Offer - 20% Off',
                description: 'Get 20% off on your first booking',
                code: 'FIRST20',
                type: 'percentage',
                discountValue: 20,
                minBookingAmount: 1000,
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
            });
        }

        // Loyalty offer for frequent users
        if (userBookings >= 5) {
            personalizedOffers.push({
                title: 'Loyalty Reward - ₹500 Off',
                description: 'Thank you for being a loyal customer',
                code: 'LOYAL500',
                type: 'fixed',
                discountValue: 500,
                minBookingAmount: 3000,
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
        }

        // High spender offer
        if (userTotalSpent >= 10000) {
            personalizedOffers.push({
                title: 'VIP Offer - 25% Off',
                description: 'Special offer for our VIP customers',
                code: 'VIP25',
                type: 'percentage',
                discountValue: 25,
                maxDiscount: 1000,
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
        }

        res.status(200).json({
            success: true,
            data: {
                generalOffers: applicableOffers,
                personalizedOffers,
                userStats: {
                    totalBookings: userBookings,
                    totalSpent: userTotalSpent,
                    isFirstBooking: userBookings === 0
                }
            }
        });
    } catch (error) {
        console.error('Get user offers error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Apply offer to booking
// @route   POST /api/offers/apply
// @access  Private
exports.applyOffer = async (req, res) => {
    try {
        const { bookingId, offerCode } = req.body;

        const booking = await Booking.findOne({
            _id: bookingId,
            user: req.user.id
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        // Check if booking already has an offer
        if (booking.promoCode) {
            return res.status(400).json({
                success: false,
                error: 'Booking already has an offer applied'
            });
        }

        // Validate offer
        const offer = await Offer.findOne({ 
            code: offerCode.toUpperCase(),
            status: 'active'
        });

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Invalid offer code'
            });
        }

        // Get car details
        const car = await require('../models/Car').findById(booking.car);

        // Check eligibility
        const eligibility = offer.canApplyToBooking({
            totalAmount: booking.baseAmount,
            totalDays: booking.totalDays,
            carId: booking.car,
            category: car?.category,
            userId: req.user.id
        });

        if (!eligibility.valid) {
            return res.status(400).json({
                success: false,
                error: eligibility.reason
            });
        }

        // Calculate discount
        const discount = offer.calculateDiscount(booking.baseAmount);

        // Update booking with offer
        booking.promoCode = offer.code;
        booking.discountAmount = discount;
        
        // Recalculate total amount
        booking.totalAmount = booking.baseAmount - discount + booking.taxAmount;

        // Add discount to additional charges
        booking.additionalCharges.push({
            description: `Promo Code: ${offer.code}`,
            amount: -discount,
            type: 'discount'
        });

        await booking.save();

        // Update offer usage
        offer.usedCount += 1;
        offer.usersUsed.push({
            user: req.user.id,
            usedAt: new Date(),
            booking: booking._id
        });
        await offer.save();

        // Create notification
        await Notification.create({
            user: req.user.id,
            title: 'Offer Applied Successfully!',
            message: `Offer ${offer.code} applied to your booking. You saved ₹${discount}`,
            type: 'offer',
            metadata: {
                bookingId: booking._id,
                offerId: offer._id,
                discountAmount: discount
            }
        });

        res.status(200).json({
            success: true,
            data: {
                booking: {
                    id: booking._id,
                    bookingNumber: booking.bookingNumber,
                    discountApplied: discount,
                    newTotal: booking.totalAmount
                },
                offer: {
                    id: offer._id,
                    title: offer.title,
                    code: offer.code
                }
            }
        });
    } catch (error) {
        console.error('Apply offer error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Helper function to generate offer code
function generateOfferCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// @desc    Get offer analytics
// @route   GET /api/offers/:id/analytics
// @access  Private/Admin
exports.getOfferAnalytics = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Offer not found'
            });
        }

        // Get bookings that used this offer
        const bookings = await Booking.find({
            promoCode: offer.code
        })
        .populate('user', 'name email')
        .populate('car', 'make model category');

        // Calculate analytics
        const analytics = {
            totalUsage: offer.usedCount,
            uniqueUsers: new Set(bookings.map(b => b.user?._id?.toString())).size,
            
            // Revenue metrics
            totalRevenue: bookings.reduce((sum, b) => sum + b.totalAmount, 0),
            totalDiscountGiven: bookings.reduce((sum, b) => sum + (b.discountAmount || 0), 0),
            avgDiscountPerBooking: offer.usedCount > 0 ? 
                bookings.reduce((sum, b) => sum + (b.discountAmount || 0), 0) / offer.usedCount : 0,
            
            // Conversion metrics
            completedBookings: bookings.filter(b => b.status === 'completed').length,
            cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
            conversionRate: bookings.length > 0 ? 
                (bookings.filter(b => b.status === 'completed').length / bookings.length * 100).toFixed(2) : 0,
            
            // Category distribution
            categoryDistribution: {},
            
            // Daily usage trend
            dailyTrend: {}
        };

        // Calculate category distribution
        bookings.forEach(booking => {
            if (booking.car?.category) {
                const category = booking.car.category;
                if (!analytics.categoryDistribution[category]) {
                    analytics.categoryDistribution[category] = {
                        count: 0,
                        revenue: 0,
                        discount: 0
                    };
                }
                analytics.categoryDistribution[category].count += 1;
                analytics.categoryDistribution[category].revenue += booking.totalAmount;
                analytics.categoryDistribution[category].discount += booking.discountAmount || 0;
            }
        });

        // Calculate daily trend (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyBookings = bookings.filter(b => 
            b.createdAt >= thirtyDaysAgo
        );

        dailyBookings.forEach(booking => {
            const date = booking.createdAt.toISOString().split('T')[0];
            if (!analytics.dailyTrend[date]) {
                analytics.dailyTrend[date] = {
                    count: 0,
                    revenue: 0,
                    discount: 0
                };
            }
            analytics.dailyTrend[date].count += 1;
            analytics.dailyTrend[date].revenue += booking.totalAmount;
            analytics.dailyTrend[date].discount += booking.discountAmount || 0;
        });

        // Convert to array for easier consumption
        analytics.categoryDistribution = Object.entries(analytics.categoryDistribution)
            .map(([category, data]) => ({
                category,
                ...data,
                avgDiscount: data.count > 0 ? data.discount / data.count : 0
            }))
            .sort((a, b) => b.revenue - a.revenue);

        analytics.dailyTrend = Object.entries(analytics.dailyTrend)
            .map(([date, data]) => ({
                date,
                ...data
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        res.status(200).json({
            success: true,
            data: {
                offer: {
                    id: offer._id,
                    title: offer.title,
                    code: offer.code,
                    type: offer.type,
                    status: offer.status
                },
                analytics,
                bookingsSummary: {
                    total: bookings.length,
                    completed: bookings.filter(b => b.status === 'completed').length,
                    cancelled: bookings.filter(b => b.status === 'cancelled').length,
                    pending: bookings.filter(b => b.status === 'pending').length
                }
            }
        });
    } catch (error) {
        console.error('Get offer analytics error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};