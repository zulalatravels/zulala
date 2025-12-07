const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    // Basic Information
    title: {
        type: String,
        required: [true, 'Please enter offer title'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Please enter offer description']
    },
    shortDescription: String,
    
    // Offer Code
    code: {
        type: String,
        required: [true, 'Please enter offer code'],
        unique: true,
        uppercase: true
    },
    
    // Offer Type
    type: {
        type: String,
        enum: [
            'percentage',       // 10% off
            'fixed',           // ₹500 off
            'free_days',       // Get 1 day free on 3 days rental
            'combo',           // Book SUV get GPS free
            'first_booking',   // Special offer for first booking
            'seasonal',        // Diwali/Christmas offer
            'referral',        // Referral bonus
            'loyalty'          // Loyalty points offer
        ],
        required: true
    },
    
    // Discount Details
    discountValue: {
        type: Number,
        required: true
    },
    minDiscount: Number,
    maxDiscount: Number,
    
    // Eligibility Criteria
    minBookingAmount: {
        type: Number,
        default: 0
    },
    minRentalDays: {
        type: Number,
        default: 0
    },
    
    // Applicability
    applicableFor: {
        type: String,
        enum: ['all', 'new_users', 'existing_users', 'specific_users'],
        default: 'all'
    },
    specificUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    applicableCategories: [String],
    applicableCars: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Car'
    }],
    excludedCars: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Car'
    }],
    
    // Validity
    validFrom: {
        type: Date,
        required: true
    },
    validUntil: {
        type: Date,
        required: true
    },
    activeDays: [{
        type: String,
        enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    }],
    activeHours: {
        from: String, // HH:MM format
        to: String
    },
    
    // Usage Limits
    usageLimit: {
        type: Number,
        default: null // null means unlimited
    },
    perUserLimit: {
        type: Number,
        default: 1
    },
    usedCount: {
        type: Number,
        default: 0
    },
    usersUsed: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usedAt: Date,
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
        }
    }],
    
    // Display & Marketing
    bannerImage: {
        url: String,
        public_id: String
    },
    thumbnail: {
        url: String,
        public_id: String
    },
    displayPriority: {
        type: Number,
        default: 1,
        min: 1,
        max: 10
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    showOnHomepage: {
        type: Boolean,
        default: false
    },
    
    // Terms & Conditions
    terms: [String],
    
    // Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'expired', 'scheduled'],
        default: 'active'
    },
    
    // Tracking
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes
offerSchema.index({ code: 1 });
offerSchema.index({ status: 1 });
offerSchema.index({ validFrom: 1, validUntil: 1 });
offerSchema.index({ isFeatured: 1 });
offerSchema.index({ displayPriority: 1 });

// Virtual for checking if offer is valid
offerSchema.virtual('isValid').get(function() {
    const now = new Date();
    return (
        this.status === 'active' &&
        this.validFrom <= now &&
        this.validUntil >= now
    );
});

// Virtual for checking if offer can be used today
offerSchema.virtual('isActiveToday').get(function() {
    if (!this.isValid) return false;
    
    if (this.activeDays && this.activeDays.length > 0) {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        return this.activeDays.includes(today);
    }
    
    return true;
});

// Method to check if user is eligible
offerSchema.methods.isUserEligible = function(user) {
    // Check if user is specific user
    if (this.applicableFor === 'specific_users') {
        return this.specificUsers.some(id => id.toString() === user._id.toString());
    }
    
    // Check if user is new/existing
    if (this.applicableFor === 'new_users') {
        return user.totalBookings === 0;
    }
    
    if (this.applicableFor === 'existing_users') {
        return user.totalBookings > 0;
    }
    
    return true;
};

// Method to check if offer can be applied to booking
offerSchema.methods.canApplyToBooking = function(bookingDetails) {
    const now = new Date();
    
    // Check validity
    if (!this.isValid || !this.isActiveToday) {
        return { valid: false, reason: 'Offer is not active' };
    }
    
    // Check usage limit
    if (this.usageLimit && this.usedCount >= this.usageLimit) {
        return { valid: false, reason: 'Offer usage limit reached' };
    }
    
    // Check minimum booking amount
    if (bookingDetails.totalAmount < this.minBookingAmount) {
        return { 
            valid: false, 
            reason: `Minimum booking amount of ₹${this.minBookingAmount} required` 
        };
    }
    
    // Check minimum rental days
    if (bookingDetails.totalDays < this.minRentalDays) {
        return { 
            valid: false, 
            reason: `Minimum ${this.minRentalDays} days rental required` 
        };
    }
    
    // Check if car is applicable
    if (this.applicableCars.length > 0 && 
        !this.applicableCars.some(id => id.toString() === bookingDetails.carId.toString())) {
        return { valid: false, reason: 'Offer not applicable for this car' };
    }
    
    // Check if car is excluded
    if (this.excludedCars.length > 0 && 
        this.excludedCars.some(id => id.toString() === bookingDetails.carId.toString())) {
        return { valid: false, reason: 'Offer not applicable for this car' };
    }
    
    // Check category
    if (this.applicableCategories.length > 0 && 
        !this.applicableCategories.includes(bookingDetails.category)) {
        return { valid: false, reason: 'Offer not applicable for this car category' };
    }
    
    // Check active hours
    if (this.activeHours && this.activeHours.from && this.activeHours.to) {
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [fromHour, fromMin] = this.activeHours.from.split(':').map(Number);
        const [toHour, toMin] = this.activeHours.to.split(':').map(Number);
        const fromTime = fromHour * 60 + fromMin;
        const toTime = toHour * 60 + toMin;
        
        if (currentTime < fromTime || currentTime > toTime) {
            return { valid: false, reason: 'Offer not active at this time' };
        }
    }
    
    return { valid: true };
};

// Method to calculate discount amount
offerSchema.methods.calculateDiscount = function(bookingAmount) {
    let discount = 0;
    
    switch (this.type) {
        case 'percentage':
            discount = (bookingAmount * this.discountValue) / 100;
            break;
            
        case 'fixed':
            discount = this.discountValue;
            break;
            
        case 'free_days':
            // This would require additional logic based on rental days
            discount = 0; // Implement based on your business logic
            break;
    }
    
    // Apply min/max limits
    if (this.minDiscount && discount < this.minDiscount) {
        discount = this.minDiscount;
    }
    
    if (this.maxDiscount && discount > this.maxDiscount) {
        discount = this.maxDiscount;
    }
    
    // Ensure discount doesn't exceed booking amount
    if (discount > bookingAmount) {
        discount = bookingAmount;
    }
    
    return discount;
};

// Update offer before saving
offerSchema.pre('save', function(next) {
    // Update status based on dates
    const now = new Date();
    if (this.validUntil < now) {
        this.status = 'expired';
    } else if (this.validFrom > now) {
        this.status = 'scheduled';
    } else {
        this.status = 'active';
    }
    
    this.updatedAt = Date.now();
    next();
});

// Static method to get active offers
offerSchema.statics.getActiveOffers = async function() {
    const now = new Date();
    return await this.find({
        status: 'active',
        validFrom: { $lte: now },
        validUntil: { $gte: now }
    })
    .sort({ displayPriority: -1, createdAt: -1 });
};

module.exports = mongoose.model('Offer', offerSchema);