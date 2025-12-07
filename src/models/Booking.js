const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    // Booking Details
    bookingNumber: {
        type: String,
        unique: true,
        required: true
    },
    
    // User & Car
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    car: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Car',
        required: true
    },
    
    // Rental Period
    pickupDate: {
        type: Date,
        required: true
    },
    dropoffDate: {
        type: Date,
        required: true
    },
    pickupTime: {
        type: String,
        required: true,
        default: '10:00 AM'
    },
    dropoffTime: {
        type: String,
        required: true,
        default: '10:00 AM'
    },
    totalDays: {
        type: Number,
        required: true
    },
    
    // Locations
    pickupLocation: {
        type: {
            type: String,
            enum: ['branch', 'address'],
            default: 'branch'
        },
        address: {
            street: String,
            city: String,
            state: String,
            pincode: String
        }
    },
    dropoffLocation: {
        type: {
            type: String,
            enum: ['branch', 'address'],
            default: 'branch'
        },
        address: {
            street: String,
            city: String,
            state: String,
            pincode: String
        }
    },
    
    // Driver Details
    driverDetails: {
        name: String,
        email: String,
        phone: String,
        age: Number,
        licenseNumber: String,
        licenseImage: {
            url: String,
            public_id: String
        }
    },
    
    // Pricing
    baseAmount: {
        type: Number,
        required: true
    },
    securityDeposit: {
        type: Number,
        required: true
    },
    additionalCharges: [{
        description: String,
        amount: Number,
        type: {
            type: String,
            enum: ['service', 'tax', 'fee', 'penalty', 'discount']
        }
    }],
    discountAmount: {
        type: Number,
        default: 0
    },
    taxAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    
    // Payment
    payment: {
        method: {
            type: String,
            enum: ['cash', 'card', 'wallet', 'upi', 'netbanking'],
            default: 'card'
        },
        status: {
            type: String,
            enum: ['pending', 'partial', 'paid', 'failed', 'refunded'],
            default: 'pending'
        },
        transactions: [{
            transactionId: String,
            amount: Number,
            method: String,
            status: String,
            razorpayOrderId: String,
            razorpayPaymentId: String,
            razorpaySignature: String,
            timestamp: {
                type: Date,
                default: Date.now
            }
        }],
        invoiceNumber: String,
        invoiceUrl: String
    },
    
    // Booking Status
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'active', 'completed', 'no_show', 'disputed'],
        default: 'pending'
    },
    
    // Cancellation
    cancellation: {
        reason: String,
        initiatedBy: {
            type: String,
            enum: ['user', 'admin', 'system']
        },
        refundAmount: Number,
        refundStatus: {
            type: String,
            enum: ['pending', 'processed', 'failed'],
            default: 'pending'
        },
        cancellationFee: Number,
        cancelledAt: Date
    },
    
    // Additional Services
    additionalServices: [{
        service: {
            type: String,
            enum: ['gps', 'child_seat', 'extra_driver', 'wifi', 'roof_rack', 'insurance', 'fuel']
        },
        quantity: Number,
        price: Number,
        total: Number
    }],
    
    // Insurance
    insurance: {
        type: {
            type: String,
            enum: ['basic', 'premium', 'full'],
            default: 'basic'
        },
        coverage: Number,
        dailyCharge: Number,
        totalCharge: Number
    },
    
    // Fuel Policy
    fuelPolicy: {
        type: String,
        enum: ['full_to_full', 'same_to_same', 'prepaid'],
        default: 'full_to_full'
    },
    fuelAtPickup: {
        level: Number,
        reading: Number
    },
    fuelAtDropoff: {
        level: Number,
        reading: Number
    },
    fuelCharges: Number,
    
    // Mileage
    mileageAtPickup: Number,
    mileageAtDropoff: Number,
    extraKilometers: Number,
    extraKmCharges: Number,
    
    // Inspection
    inspection: {
        pickup: {
            conductedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            notes: String,
            images: [{
                url: String,
                public_id: String,
                description: String
            }],
            timestamp: Date,
            signature: String
        },
        dropoff: {
            conductedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            notes: String,
            images: [{
                url: String,
                public_id: String,
                description: String
            }],
            timestamp: Date,
            signature: String
        },
        damages: [{
            description: String,
            severity: {
                type: String,
                enum: ['minor', 'major', 'critical']
            },
            images: [String],
            repairCost: Number,
            status: {
                type: String,
                enum: ['reported', 'assessed', 'repaired', 'charged']
            }
        }]
    },
    
    // Documents
    documents: {
        agreement: {
            url: String,
            public_id: String
        },
        receipt: {
            url: String,
            public_id: String
        }
    },
    
    // Promo & Referral
    promoCode: String,
    referralUsed: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Referral'
    },
    
    // Communication
    notes: String,
    specialRequests: String,
    
    // Extension Requests
    extensionRequests: [{
        requestedAt: Date,
        currentDropoffDate: Date,
        requestedDropoffDate: Date,
        extensionDays: Number,
        extensionCost: Number,
        reason: String,
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        approvedAt: Date
    }],
    
    // Review
    review: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comment: String,
        categories: {
            cleanliness: Number,
            comfort: Number,
            performance: Number,
            features: Number,
            value: Number
        },
        createdAt: Date
    },
    
    // Timestamps
    confirmedAt: Date,
    pickedUpAt: Date,
    droppedOffAt: Date,
    completedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes
bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ user: 1 });
bookingSchema.index({ car: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ pickupDate: 1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ 'payment.status': 1 });

// Generate booking number
bookingSchema.pre('save', async function(next) {
    if (this.isNew) {
        const count = await this.constructor.countDocuments();
        this.bookingNumber = `BOOK${Date.now().toString().slice(-8)}${(count + 1).toString().padStart(4, '0')}`;
        
        // Calculate total days
        if (this.pickupDate && this.dropoffDate) {
            const diffTime = Math.abs(this.dropoffDate - this.pickupDate);
            this.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
    }
    next();
});

// Calculate total amount
bookingSchema.methods.calculateTotal = function() {
    let total = this.baseAmount;
    
    this.additionalCharges.forEach(charge => {
        if (charge.type === 'discount') {
            total -= charge.amount;
        } else {
            total += charge.amount;
        }
    });
    
    this.additionalServices.forEach(service => {
        total += service.total || (service.price * service.quantity);
    });
    
    if (this.insurance && this.insurance.totalCharge) {
        total += this.insurance.totalCharge;
    }
    
    total += this.taxAmount;
    
    return total;
};

// Check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
    const now = new Date();
    const hoursUntilPickup = (this.pickupDate - now) / (1000 * 60 * 60);
    
    if (this.status !== 'confirmed' && this.status !== 'pending') {
        return false;
    }
    
    if (hoursUntilPickup < 24) {
        return false;
    }
    
    return true;
};

// Calculate cancellation fee
bookingSchema.methods.calculateCancellationFee = function() {
    const now = new Date();
    const hoursUntilPickup = (this.pickupDate - now) / (1000 * 60 * 60);
    
    if (hoursUntilPickup > 48) {
        return this.totalAmount * 0.10; // 10% fee
    } else if (hoursUntilPickup > 24) {
        return this.totalAmount * 0.25; // 25% fee
    } else {
        return this.totalAmount * 0.50; // 50% fee
    }
};

// Get upcoming bookings
bookingSchema.statics.getUpcomingBookings = async function(userId) {
    return await this.find({
        user: userId,
        pickupDate: { $gte: new Date() },
        status: { $in: ['confirmed', 'pending'] }
    })
    .sort({ pickupDate: 1 })
    .populate('car', 'make model images licensePlate');
};

// Get booking stats
bookingSchema.statics.getStats = async function() {
    const stats = await this.aggregate([
        {
            $group: {
                _id: null,
                totalBookings: { $sum: 1 },
                totalRevenue: { $sum: '$totalAmount' },
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
    ]);
    
    return stats[0] || {
        totalBookings: 0,
        totalRevenue: 0,
        pendingBookings: 0,
        confirmedBookings: 0,
        activeBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0
    };
};

module.exports = mongoose.model('Booking', bookingSchema);