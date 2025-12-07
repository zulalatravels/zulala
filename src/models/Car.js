const mongoose = require('mongoose');

const carSchema = new mongoose.Schema({
    make: {
        type: String,
        required: [true, 'Please add car make'],
        trim: true
    },
    model: {
        type: String,
        required: [true, 'Please add car model'],
        trim: true
    },
    year: {
        type: Number,
        required: [true, 'Please add manufacturing year'],
        min: [2000, 'Year must be 2000 or later'],
        max: [new Date().getFullYear() + 1, 'Year cannot be in the future']
    },
    variant: String,
    
    // Identification
    licensePlate: {
        type: String,
        required: [true, 'Please enter license plate number'],
        unique: true,
        uppercase: true
    },
    vin: {
        type: String,
        unique: true,
        uppercase: true
    },
    
    // Specifications
    category: {
        type: String,
        enum: ['hatchback', 'sedan', 'suv', 'muv', 'luxury', 'electric'],
        required: true
    },
    transmission: {
        type: String,
        enum: ['automatic', 'manual', 'semi-automatic'],
        default: 'automatic'
    },
    fuelType: {
        type: String,
        enum: ['petrol', 'diesel', 'electric', 'hybrid'],
        required: true
    },
    seats: {
        type: Number,
        required: true,
        min: [2, 'Car must have at least 2 seats'],
        max: [12, 'Car cannot have more than 12 seats']
    },
    mileage: {
        city: Number,
        highway: Number,
        average: Number
    },
    engine: {
        capacity: String,
        power: String,
        torque: String
    },
    
    // Features
    features: {
        entertainment: [String],
        comfort: [String],
        safety: [String],
        exterior: [String],
        interior: [String]
    },
    
    // Pricing
    pricePerDay: {
        type: Number,
        required: true,
        min: [0, 'Price cannot be negative']
    },
    pricePerWeek: Number,
    pricePerMonth: Number,
    securityDeposit: {
        type: Number,
        required: true
    },
    kilometerLimit: {
        type: Number,
        default: 300
    },
    extraKmCharge: {
        type: Number,
        default: 10
    },
    
    // Images
    images: [{
        url: String,
        public_id: String,
        caption: String,
        isPrimary: {
            type: Boolean,
            default: false
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    videoTour: {
        url: String,
        thumbnail: String
    },
    
    // Location
    location: {
        address: String,
        city: {
            type: String,
            required: true
        },
        state: String,
        pincode: String,
        coordinates: {
            lat: Number,
            lng: Number
        }
    },
    
    // Availability
    availability: {
        type: String,
        enum: ['available', 'booked', 'maintenance', 'unavailable'],
        default: 'available'
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    isRecommended: {
        type: Boolean,
        default: false
    },
    
    // Insurance & Documents
    insurance: {
        provider: String,
        policyNumber: String,
        validFrom: Date,
        validUntil: Date,
        coverageAmount: Number,
        document: {
            url: String,
            public_id: String
        }
    },
    
    // Ratings
    rating: {
        average: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        },
        breakdown: {
            cleanliness: { type: Number, default: 0 },
            comfort: { type: Number, default: 0 },
            performance: { type: Number, default: 0 },
            features: { type: Number, default: 0 },
            value: { type: Number, default: 0 }
        }
    },
    
    // Maintenance
    maintenance: {
        lastService: Date,
        nextService: Date,
        serviceHistory: [{
            date: Date,
            type: String,
            details: String,
            cost: Number,
            mileage: Number,
            workshop: String
        }],
        currentMileage: Number,
        fuelLevel: {
            type: Number,
            min: 0,
            max: 100,
            default: 100
        }
    },
    
    // Status & Tracking
    status: {
        type: String,
        enum: ['active', 'inactive', 'deleted'],
        default: 'active'
    },
    totalBookings: {
        type: Number,
        default: 0
    },
    totalRevenue: {
        type: Number,
        default: 0
    },
    lastBooked: Date,
    
    // Admin
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Metadata
    description: String,
    tags: [String],
    notes: String,
    
    // Timestamps
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
carSchema.index({ make: 1, model: 1 });
carSchema.index({ category: 1 });
carSchema.index({ 'location.city': 1 });
carSchema.index({ pricePerDay: 1 });
carSchema.index({ availability: 1 });
carSchema.index({ rating: -1 });
carSchema.index({ isFeatured: 1 });
carSchema.index({ isRecommended: 1 });

// Check availability for dates
carSchema.methods.isAvailableForDates = async function(startDate, endDate) {
    const Booking = mongoose.model('Booking');
    
    const overlappingBookings = await Booking.find({
        car: this._id,
        status: { $in: ['confirmed', 'active', 'pending'] },
        $or: [
            {
                pickupDate: { $lte: endDate },
                dropoffDate: { $gte: startDate }
            }
        ]
    });
    
    return overlappingBookings.length === 0;
};

// Calculate rental price
carSchema.methods.calculateRentalPrice = function(days, extras = {}) {
    let total = 0;
    
    if (days >= 30 && this.pricePerMonth) {
        const months = Math.floor(days / 30);
        const remainingDays = days % 30;
        total = (months * this.pricePerMonth) + (remainingDays * this.pricePerDay);
    } else if (days >= 7 && this.pricePerWeek) {
        const weeks = Math.floor(days / 7);
        const remainingDays = days % 7;
        total = (weeks * this.pricePerWeek) + (remainingDays * this.pricePerDay);
    } else {
        total = days * this.pricePerDay;
    }
    
    if (extras.extraKms && this.extraKmCharge) {
        total += extras.extraKms * this.extraKmCharge;
    }
    
    if (extras.additionalServices) {
        extras.additionalServices.forEach(service => {
            total += service.price;
        });
    }
    
    return total;
};

// Get featured cars
carSchema.statics.getFeaturedCars = async function(limit = 10) {
    return await this.find({
        status: 'active',
        availability: 'available',
        isFeatured: true
    })
    .sort({ rating: -1, totalBookings: -1 })
    .limit(limit);
};

// Update car before saving
carSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Car', carSchema);