const Booking = require('../models/Booking');
const Car = require('../models/Car');
const User = require('../models/User');
const Offer = require('../models/Offer');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');
const { generateInvoice } = require('../utils/invoiceGenerator');

// @desc    Create booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
    try {
        const { 
            carId, 
            pickupDate, 
            dropoffDate, 
            pickupLocation, 
            dropoffLocation,
            driverDetails,
            additionalServices,
            promoCode,
            paymentMethod 
        } = req.body;


        // Validate dates
        if (new Date(pickupDate) >= new Date(dropoffDate)) {
            return res.status(400).json({
                success: false,
                error: 'Dropoff date must be after pickup date'
            });
        }

        // Check if pickup is at least 2 hours from now
        const minPickupTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
        if (new Date(pickupDate) < minPickupTime) {
            return res.status(400).json({
                success: false,
                error: 'Pickup must be at least 2 hours from now'
            });
        }

        // Get car details
        const car = await Car.findById(carId);
        if (!car || car.status !== 'active') {
            return res.status(404).json({
                success: false,
                error: 'Car not found or not available'
            });
        }

        // Check availability
        const isAvailable = await car.isAvailableForDates(
            new Date(pickupDate),
            new Date(dropoffDate)
        );

        if (!isAvailable) {
            return res.status(400).json({
                success: false,
                error: 'Car not available for selected dates'
            });
        }

        // Calculate rental period
        const start = new Date(pickupDate);
        const end = new Date(dropoffDate);
        const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

        // Calculate base amount
        let baseAmount = car.calculateRentalPrice(totalDays);

        // Calculate security deposit
        const securityDeposit = car.securityDeposit;

        // Process additional services
        let additionalCharges = [];
        let servicesTotal = 0;

        if (additionalServices && additionalServices.length > 0) {
            additionalServices.forEach(service => {
                const serviceTotal = service.price * service.quantity;
                servicesTotal += serviceTotal;
                
                additionalCharges.push({
                    description: service.description || service.service,
                    amount: serviceTotal,
                    type: 'service'
                });
            });
        }

        // Apply promo code if provided
        let discountAmount = 0;
        let promoUsed = null;

        if (promoCode) {
            const offer = await Offer.findOne({ 
                code: promoCode.toUpperCase(),
                status: 'active'
            });

            if (offer) {
                const eligibility = offer.canApplyToBooking({
                    totalAmount: baseAmount + servicesTotal,
                    totalDays,
                    carId: car._id,
                    category: car.category,
                    userId: req.user.id
                });

                if (eligibility.valid) {
                    discountAmount = offer.calculateDiscount(baseAmount + servicesTotal);
                    
                    additionalCharges.push({
                        description: `Promo Code: ${offer.code}`,
                        amount: -discountAmount, // Negative for discount
                        type: 'discount'
                    });

                    promoUsed = offer._id;
                    
                    // Increment offer usage
                    offer.usedCount += 1;
                    offer.usersUsed.push({
                        user: req.user.id,
                        usedAt: new Date()
                    });
                    await offer.save();
                }
            }
        }

        // Calculate taxes (18% GST)
        const taxableAmount = baseAmount + servicesTotal - discountAmount;
        const taxAmount = taxableAmount * 0.18;

        additionalCharges.push({
            description: 'GST (18%)',
            amount: taxAmount,
            type: 'tax'
        });

        // Calculate total amount
        const totalAmount = baseAmount + servicesTotal + taxAmount - discountAmount + securityDeposit;

        // Create booking
        const booking = await Booking.create({
            user: req.user.id,
            car: carId,
            pickupDate: start,
            dropoffDate: end,
            pickupTime: req.body.pickupTime || '10:00',
            dropoffTime: req.body.dropoffTime || '10:00',
            totalDays,
            pickupLocation: {
                type: pickupLocation.type || 'branch',
                address: pickupLocation.address,
                branch: pickupLocation.branchId
            },
            dropoffLocation: {
                type: dropoffLocation.type || 'branch',
                address: dropoffLocation.address,
                branch: dropoffLocation.branchId
            },
            driverDetails,
            additionalServices,
            baseAmount,
            securityDeposit,
            additionalCharges,
            discountAmount,
            taxAmount,
            totalAmount,
            paidAmount: 0,
            payment: {
                method: paymentMethod || 'card',
                status: 'pending'
            },
            status: 'pending',
            specialRequests: req.body.specialRequests
        });

        // Update car's next booking date
        car.lastBooked = new Date();
        await car.save();

        // Generate invoice
        const invoiceData = {
            bookingNumber: booking.bookingNumber,
            userName: req.user.name,
            userEmail: req.user.email,
            carDetails: `${car.make} ${car.model} - ${car.licensePlate}`,
            pickupDate: start,
            dropoffDate: end,
            totalDays,
            baseAmount,
            additionalCharges,
            discountAmount,
            taxAmount,
            securityDeposit,
            totalAmount
        };

        const invoiceUrl = await generateInvoice(invoiceData);
        
        // Update booking with invoice URL
        booking.payment.invoiceUrl = invoiceUrl;
        booking.payment.invoiceNumber = `INV-${booking.bookingNumber}`;
        await booking.save();

        // Send booking confirmation email
        await sendEmail({
            email: req.user.email,
            subject: `Booking Confirmation #${booking.bookingNumber}`,
            template: 'bookingConfirmation',
            context: {
                userName: req.user.name,
                bookingNumber: booking.bookingNumber,
                carDetails: `${car.make} ${car.model}`,
                pickupDate: start.toLocaleDateString(),
                dropoffDate: end.toLocaleDateString(),
                totalDays,
                totalAmount,
                invoiceUrl,
                supportPhone: process.env.SUPPORT_PHONE
            }
        });

        // Create notification
        await Notification.create({
            user: req.user.id,
            title: 'Booking Created!',
            message: `Your booking #${booking.bookingNumber} has been created. Please complete payment to confirm.`,
            type: 'booking',
            metadata: {
                bookingId: booking._id,
                bookingNumber: booking.bookingNumber,
                amount: totalAmount
            },
            sendEmail: true
        });

        // Notify admin about new booking
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            await Notification.create({
                user: admin._id,
                title: 'New Booking Request',
                message: `New booking #${booking.bookingNumber} created by ${req.user.name}`,
                type: 'system',
                metadata: {
                    bookingId: booking._id,
                    userId: req.user.id
                }
            });
        }

        res.status(201).json({
            success: true,
            data: booking
        });

    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get user bookings
// @route   GET /api/bookings/mybookings
// @access  Private
exports.getMyBookings = async (req, res) => {
    try {
        const { 
            status, 
            page = 1, 
            limit = 10,
            sortBy = '-createdAt'
        } = req.query;

        const query = { user: req.user.id };
        
        if (status) {
            query.status = status;
        }

        const bookings = await Booking.find(query)
            .populate('car', 'make model images licensePlate')
            .sort(sortBy)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Booking.countDocuments(query);

        res.status(200).json({
            success: true,
            count: bookings.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: bookings
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
exports.getBooking = async (req, res) => {
    try {
        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.user.id
        })
        .populate('car')
        .populate('user', 'name email phone');

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error('Get booking error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get upcoming bookings
// @route   GET /api/bookings/upcoming
// @access  Private
exports.getUpcomingBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({
            user: req.user.id,
            pickupDate: { $gte: new Date() },
            status: { $in: ['confirmed', 'pending'] }
        })
        .populate('car', 'make model images licensePlate')
        .sort('pickupDate')
        .limit(10);

        res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (error) {
        console.error('Get upcoming bookings error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res) => {
    try {
        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        // Check if booking can be cancelled
        if (!booking.canBeCancelled()) {
            return res.status(400).json({
                success: false,
                error: 'Booking cannot be cancelled at this time'
            });
        }

        // Calculate cancellation fee
        const cancellationFee = booking.calculateCancellationFee();
        
        // Update booking status
        booking.status = 'cancelled';
        booking.cancellation = {
            reason: req.body.reason,
            initiatedBy: 'user',
            cancellationFee,
            cancelledAt: new Date(),
            refundAmount: booking.payment.status === 'paid' ? 
                booking.totalAmount - cancellationFee : 0,
            refundStatus: booking.payment.status === 'paid' ? 'pending' : 'not_applicable'
        };

        // Update payment status
        if (booking.payment.status === 'paid') {
            booking.payment.status = 'refund_pending';
        }

        await booking.save();

        // Update car availability
        await Car.findByIdAndUpdate(booking.car, {
            availability: 'available'
        });

        // Send cancellation email
        await sendEmail({
            email: req.user.email,
            subject: `Booking Cancelled #${booking.bookingNumber}`,
            template: 'bookingCancellation',
            context: {
                userName: req.user.name,
                bookingNumber: booking.bookingNumber,
                cancellationFee,
                refundAmount: booking.cancellation.refundAmount,
                reason: req.body.reason
            }
        });

        // Create notification
        await Notification.create({
            user: req.user.id,
            title: 'Booking Cancelled',
            message: `Your booking #${booking.bookingNumber} has been cancelled.`,
            type: 'booking',
            metadata: {
                bookingId: booking._id,
                cancellationFee,
                refundAmount: booking.cancellation.refundAmount
            },
            sendEmail: true
        });

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update booking (admin only)
// @route   PUT /api/bookings/:id
// @access  Private/Admin
exports.updateBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        // Update allowed fields
        const allowedUpdates = [
            'pickupDate', 'dropoffDate', 'pickupTime', 'dropoffTime',
            'pickupLocation', 'dropoffLocation', 'driverDetails',
            'additionalServices', 'specialRequests', 'status'
        ];

        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                booking[key] = req.body[key];
            }
        });

        // If status changed to active (car picked up)
        if (req.body.status === 'active' && booking.status !== 'active') {
            booking.pickedUpAt = new Date();
            
            // Update car status
            await Car.findByIdAndUpdate(booking.car, {
                availability: 'booked'
            });
        }

        // If status changed to completed (car returned)
        if (req.body.status === 'completed' && booking.status !== 'completed') {
            booking.droppedOffAt = new Date();
            booking.completedAt = new Date();
            
            // Update car status and stats
            const car = await Car.findById(booking.car);
            car.availability = 'available';
            car.totalBookings += 1;
            car.totalRevenue += booking.totalAmount;
            await car.save();
            
            // Update user stats
            await User.findByIdAndUpdate(booking.user, {
                $inc: { totalSpent: booking.totalAmount }
            });
        }

        await booking.save();

        // Send notification to user if status changed
        if (req.body.status && req.body.status !== booking.status) {
            await Notification.create({
                user: booking.user,
                title: 'Booking Status Updated',
                message: `Your booking #${booking.bookingNumber} status has been updated to ${req.body.status}`,
                type: 'booking',
                metadata: {
                    bookingId: booking._id,
                    newStatus: req.body.status
                },
                sendEmail: true
            });
        }

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error('Update booking error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get all bookings (admin)
// @route   GET /api/bookings
// @access  Private/Admin
exports.getAllBookings = async (req, res) => {
    try {
        const { 
            status, 
            startDate, 
            endDate,
            page = 1, 
            limit = 20,
            search 
        } = req.query;

        const query = {};

        // Filter by status
        if (status) {
            query.status = status;
        }

        // Filter by date range
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Search by booking number, user name, or car details
        if (search) {
            const userQuery = await User.find({
                $or: [
                    { name: new RegExp(search, 'i') },
                    { email: new RegExp(search, 'i') },
                    { phone: new RegExp(search, 'i') }
                ]
            }).select('_id');

            const userIds = userQuery.map(user => user._id);

            const carQuery = await Car.find({
                $or: [
                    { make: new RegExp(search, 'i') },
                    { model: new RegExp(search, 'i') },
                    { licensePlate: new RegExp(search, 'i') }
                ]
            }).select('_id');

            const carIds = carQuery.map(car => car._id);

            query.$or = [
                { bookingNumber: new RegExp(search, 'i') },
                { user: { $in: userIds } },
                { car: { $in: carIds } }
            ];
        }

        const bookings = await Booking.find(query)
            .populate('user', 'name email phone')
            .populate('car', 'make model licensePlate')
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Booking.countDocuments(query);

        // Get booking statistics
        const stats = await Booking.getStats();

        res.status(200).json({
            success: true,
            count: bookings.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            stats,
            data: bookings
        });
    } catch (error) {
        console.error('Get all bookings error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get booking statistics
// @route   GET /api/bookings/stats
// @access  Private/Admin
exports.getBookingStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchStage = {};
        
        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) matchStage.createdAt.$lte = new Date(endDate);
        }

        // Monthly revenue statistics
        const monthlyStats = await Booking.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    totalBookings: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' },
                    completedBookings: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    cancelledBookings: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Car category statistics
        const categoryStats = await Booking.aggregate([
            { $match: matchStage },
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
                    totalBookings: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' },
                    avgBookingValue: { $avg: '$totalAmount' }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // Payment method statistics
        const paymentStats = await Booking.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$payment.method',
                    totalBookings: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // Daily booking trends (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyTrends = await Booking.aggregate([
            {
                $match: {
                    createdAt: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    bookings: { $sum: 1 },
                    revenue: { $sum: '$totalAmount' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            { $limit: 30 }
        ]);

        // Top users
        const topUsers = await Booking.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$user',
                    totalBookings: { $sum: 1 },
                    totalSpent: { $sum: '$totalAmount' },
                    avgBookingValue: { $avg: '$totalAmount' }
                }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            { $unwind: '$userDetails' },
            {
                $project: {
                    userId: '$_id',
                    userName: '$userDetails.name',
                    userEmail: '$userDetails.email',
                    totalBookings: 1,
                    totalSpent: 1,
                    avgBookingValue: 1
                }
            }
        ]);

        // Recent bookings for dashboard
        const recentBookings = await Booking.find(matchStage)
            .populate('user', 'name email')
            .populate('car', 'make model')
            .sort('-createdAt')
            .limit(10);

        res.status(200).json({
            success: true,
            data: {
                monthlyStats,
                categoryStats,
                paymentStats,
                dailyTrends,
                topUsers,
                recentBookings,
                summary: await Booking.getStats()
            }
        });
    } catch (error) {
        console.error('Get booking stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Process booking return
// @route   POST /api/bookings/:id/return
// @access  Private/Admin
exports.processReturn = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('car')
            .populate('user');

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        if (booking.status !== 'active') {
            return res.status(400).json({
                success: false,
                error: 'Booking is not active'
            });
        }

        const {
            mileageAtDropoff,
            fuelLevel,
            inspectionNotes,
            damages,
            extraCharges
        } = req.body;

        // Update inspection details
        booking.inspection.dropoff = {
            conductedBy: req.user.id,
            notes: inspectionNotes,
            timestamp: new Date(),
            signature: req.body.signatureUrl
        };

        // Update fuel and mileage
        booking.fuelAtDropoff = {
            level: fuelLevel,
            reading: mileageAtDropoff
        };

        booking.mileageAtDropoff = mileageAtDropoff;

        // Calculate extra kilometers
        if (mileageAtDropoff && booking.mileageAtPickup) {
            const totalKms = mileageAtDropoff - booking.mileageAtPickup;
            const allowedKms = booking.totalDays * booking.car.kilometerLimit;
            
            if (totalKms > allowedKms) {
                const extraKms = totalKms - allowedKms;
                booking.extraKilometers = extraKms;
                booking.extraKmCharges = extraKms * booking.car.extraKmCharge;
                
                booking.additionalCharges.push({
                    description: `Extra kilometers (${extraKms} km)`,
                    amount: booking.extraKmCharges,
                    type: 'fee'
                });
            }
        }

        // Calculate fuel charges
        if (fuelLevel < booking.fuelAtPickup.level) {
            const fuelDifference = booking.fuelAtPickup.level - fuelLevel;
            const fuelCharge = (fuelDifference / 100) * 5000; // Assuming 5000 is fuel tank capacity cost
            booking.fuelCharges = fuelCharge;
            
            booking.additionalCharges.push({
                description: 'Fuel refill charges',
                amount: fuelCharge,
                type: 'fee'
            });
        }

        // Process damages
        if (damages && damages.length > 0) {
            booking.inspection.damages = damages.map(damage => ({
                ...damage,
                status: 'reported'
            }));
        }

        // Add extra charges
        if (extraCharges && extraCharges.length > 0) {
            extraCharges.forEach(charge => {
                booking.additionalCharges.push({
                    description: charge.description,
                    amount: charge.amount,
                    type: charge.type || 'penalty'
                });
            });
        }

        // Recalculate total amount
        let newTotal = booking.baseAmount;
        booking.additionalCharges.forEach(charge => {
            if (charge.type === 'discount') {
                newTotal -= charge.amount;
            } else {
                newTotal += charge.amount;
            }
        });

        booking.totalAmount = newTotal;

        // If security deposit needs adjustment
        if (newTotal > booking.baseAmount) {
            const additionalAmount = newTotal - booking.baseAmount;
            
            // Add to payment transactions
            booking.payment.transactions.push({
                amount: additionalAmount,
                method: 'security_deposit_adjustment',
                status: 'pending',
                timestamp: new Date()
            });
        }

        // Update booking status
        booking.status = 'completed';
        booking.droppedOffAt = new Date();
        booking.completedAt = new Date();

        await booking.save();

        // Update car
        const car = booking.car;
        car.availability = 'available';
        car.maintenance.currentMileage = mileageAtDropoff;
        car.maintenance.fuelLevel = fuelLevel;
        await car.save();

        // Update user stats
        await User.findByIdAndUpdate(booking.user._id, {
            $inc: { totalSpent: booking.totalAmount }
        });

        // Generate final invoice
        const invoiceData = {
            bookingNumber: booking.bookingNumber,
            userName: booking.user.name,
            userEmail: booking.user.email,
            carDetails: `${car.make} ${car.model} - ${car.licensePlate}`,
            pickupDate: booking.pickupDate,
            dropoffDate: booking.dropoffDate,
            totalDays: booking.totalDays,
            baseAmount: booking.baseAmount,
            additionalCharges: booking.additionalCharges,
            discountAmount: booking.discountAmount,
            taxAmount: booking.taxAmount,
            securityDeposit: car.securityDeposit,
            totalAmount: booking.totalAmount,
            extraCharges: {
                extraKilometers: booking.extraKmCharges,
                fuelCharges: booking.fuelCharges,
                damages: booking.inspection.damages
            }
        };

        const finalInvoiceUrl = await generateInvoice(invoiceData, true);

        // Update booking with final invoice
        booking.documents.receipt = {
            url: finalInvoiceUrl,
            public_id: `receipt-${booking.bookingNumber}`
        };
        await booking.save();

        // Send completion email
        await sendEmail({
            email: booking.user.email,
            subject: `Booking Completed #${booking.bookingNumber}`,
            template: 'bookingCompletion',
            context: {
                userName: booking.user.name,
                bookingNumber: booking.bookingNumber,
                carDetails: `${car.make} ${car.model}`,
                totalAmount: booking.totalAmount,
                invoiceUrl: finalInvoiceUrl,
                securityDepositRefund: car.securityDeposit - (booking.totalAmount - booking.baseAmount)
            }
        });

        // Create notification
        await Notification.create({
            user: booking.user._id,
            title: 'Booking Completed',
            message: `Your booking #${booking.bookingNumber} has been completed. Final invoice has been generated.`,
            type: 'booking',
            metadata: {
                bookingId: booking._id,
                invoiceUrl: finalInvoiceUrl
            },
            sendEmail: true
        });

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error('Process return error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get booking invoice
// @route   GET /api/bookings/:id/invoice
// @access  Private
exports.getBookingInvoice = async (req, res) => {
    try {
        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.user.id
        })
        .populate('car')
        .populate('user');

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        // Return invoice URL
        res.status(200).json({
            success: true,
            data: {
                invoiceUrl: booking.payment.invoiceUrl,
                bookingNumber: booking.bookingNumber,
                status: booking.status
            }
        });
    } catch (error) {
        console.error('Get invoice error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Add review to booking
// @route   POST /api/bookings/:id/review
// @access  Private
exports.addReview = async (req, res) => {
    try {
        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.user.id,
            status: 'completed'
        })
        .populate('car');

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found or not eligible for review'
            });
        }

        const { rating, comment, categories } = req.body;

        // Check if already reviewed
        if (booking.review) {
            return res.status(400).json({
                success: false,
                error: 'Booking already reviewed'
            });
        }

        // Add review to booking
        booking.review = {
            rating,
            comment,
            categories,
            createdAt: new Date()
        };

        await booking.save();

        // Update car rating
        const car = booking.car;
        
        // Calculate new average rating
        const newTotalRating = (car.rating.average * car.rating.count) + rating;
        car.rating.count += 1;
        car.rating.average = newTotalRating / car.rating.count;

        // Update category ratings if provided
        if (categories) {
            Object.keys(categories).forEach(category => {
                if (!car.rating.breakdown[category]) {
                    car.rating.breakdown[category] = 0;
                }
                // Update category rating (simple average)
                car.rating.breakdown[category] = 
                    (car.rating.breakdown[category] + categories[category]) / 2;
            });
        }

        await car.save();

        // Create notification for admin
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            await Notification.create({
                user: admin._id,
                title: 'New Review',
                message: `${req.user.name} left a ${rating}-star review for booking #${booking.bookingNumber}`,
                type: 'system',
                metadata: {
                    bookingId: booking._id,
                    carId: car._id,
                    rating
                }
            });
        }

        res.status(200).json({
            success: true,
            data: booking.review
        });
    } catch (error) {
        console.error('Add review error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get booking calendar (available dates for a car)
// @route   GET /api/bookings/calendar/:carId
// @access  Public
exports.getBookingCalendar = async (req, res) => {
    try {
        const { carId } = req.params;
        const { month, year } = req.query;

        const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        const targetYear = year ? parseInt(year) : new Date().getFullYear();

        // Get all bookings for the car in the specified month
        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0);

        const bookings = await Booking.find({
            car: carId,
            status: { $in: ['confirmed', 'active'] },
            $or: [
                {
                    pickupDate: { $lte: endDate },
                    dropoffDate: { $gte: startDate }
                }
            ]
        })
        .select('pickupDate dropoffDate status')
        .sort('pickupDate');

        // Generate calendar with availability
        const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
        const calendar = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(targetYear, targetMonth - 1, day);
            const dateStr = currentDate.toISOString().split('T')[0];

            // Check if date is booked
            let isBooked = false;
            let bookingInfo = null;

            for (const booking of bookings) {
                if (currentDate >= booking.pickupDate && currentDate <= booking.dropoffDate) {
                    isBooked = true;
                    bookingInfo = {
                        bookingId: booking._id,
                        status: booking.status
                    };
                    break;
                }
            }

            calendar.push({
                date: dateStr,
                day,
                isBooked,
                bookingInfo,
                isPast: currentDate < new Date(),
                isToday: dateStr === new Date().toISOString().split('T')[0]
            });
        }

        res.status(200).json({
            success: true,
            data: {
                month: targetMonth,
                year: targetYear,
                calendar,
                bookings: bookings.length
            }
        });
    } catch (error) {
        console.error('Get calendar error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Extend booking
// @route   POST /api/bookings/:id/extend
// @access  Private
exports.extendBooking = async (req, res) => {
    try {
        const { newDropoffDate, reason } = req.body;

        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.user.id,
            status: 'active'
        })
        .populate('car');

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Active booking not found'
            });
        }

        const newDropoff = new Date(newDropoffDate);
        
        if (newDropoff <= booking.dropoffDate) {
            return res.status(400).json({
                success: false,
                error: 'New dropoff date must be after current dropoff date'
            });
        }

        // Check car availability for extension period
        const isAvailable = await booking.car.isAvailableForDates(
            booking.dropoffDate,
            newDropoff
        );

        if (!isAvailable) {
            return res.status(400).json({
                success: false,
                error: 'Car not available for extended period'
            });
        }

        // Calculate extension days and cost
        const extensionDays = Math.ceil(
            (newDropoff - booking.dropoffDate) / (1000 * 60 * 60 * 24)
        );
        const extensionCost = booking.car.pricePerDay * extensionDays;

        // Create extension request
        const extensionRequest = {
            requestedAt: new Date(),
            currentDropoffDate: booking.dropoffDate,
            requestedDropoffDate: newDropoff,
            extensionDays,
            extensionCost,
            reason,
            status: 'pending',
            approvedBy: null,
            approvedAt: null
        };

        booking.extensionRequests = booking.extensionRequests || [];
        booking.extensionRequests.push(extensionRequest);

        await booking.save();

        // Notify admin
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            await Notification.create({
                user: admin._id,
                title: 'Booking Extension Request',
                message: `${req.user.name} requested to extend booking #${booking.bookingNumber} by ${extensionDays} days`,
                type: 'system',
                metadata: {
                    bookingId: booking._id,
                    userId: req.user.id,
                    extensionRequestId: extensionRequest._id
                }
            });
        }

        // Send confirmation to user
        await Notification.create({
            user: req.user.id,
            title: 'Extension Request Submitted',
            message: `Your request to extend booking #${booking.bookingNumber} has been submitted for approval.`,
            type: 'booking',
            metadata: {
                bookingId: booking._id,
                extensionDays,
                extensionCost
            }
        });

        res.status(200).json({
            success: true,
            data: extensionRequest
        });
    } catch (error) {
        console.error('Extend booking error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};