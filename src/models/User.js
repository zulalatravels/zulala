const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name'],
        trim: true,
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        lowercase: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    phone: {
        type: String,
        required: [true, 'Please enter your phone number'],
        match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
    },
    
    // Identification
    driverLicense: {
        type: String,
        required: [true, 'Please enter your driver license number'],
        unique: true
    },
    licenseImage: {
        url: String,
        public_id: String
    },
    profileImage: {
        url: {
            type: String,
            default: 'https://res.cloudinary.com/demo/image/upload/v1674567890/default-avatar.png'
        },
        public_id: String
    },
    
    // Address
    address: {
        street: String,
        city: String,
        state: String,
        country: {
            type: String,
            default: 'India'
        },
        pincode: String
    },
    
    // Role & Status
    role: {
        type: String,
        enum: ['user', 'admin', 'super_admin'],
        default: 'user'
    },
    status: {
        type: String,
        enum: ['active', 'suspended', 'deactivated'],
        default: 'active'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    isPhoneVerified: {
        type: Boolean,
        default: false
    },
    
    // Financial
    walletBalance: {
        type: Number,
        default: 0,
        min: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    
    // Referral System
    referralCode: {
        type: String,
        unique: true,
        uppercase: true
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    referralPoints: {
        type: Number,
        default: 0
    },
    totalReferrals: {
        type: Number,
        default: 0
    },
    
    // Security
    verificationToken: String,
    verificationTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    phoneVerificationOTP: String,
    phoneVerificationExpires: Date,
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: Date,
    
    // Preferences
    preferences: {
        notifications: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: true },
            push: { type: Boolean, default: true }
        },
        language: {
            type: String,
            default: 'en'
        },
        currency: {
            type: String,
            default: 'INR'
        }
    },
    
    // Timestamps
    lastLogin: Date,
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
userSchema.index({ email: 1 });
userSchema.index({ referralCode: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });

// Hash password
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Generate referral code
userSchema.pre('save', function(next) {
    if (this.isNew && !this.referralCode) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        this.referralCode = code;
    }
    next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function() {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        { 
            id: this._id,
            email: this.email,
            role: this.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
    );
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
    const resetToken = crypto.randomBytes(20).toString('hex');
    
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    return resetToken;
};

// Generate verification token
userSchema.methods.generateVerificationToken = function() {
    const verificationToken = crypto.randomBytes(20).toString('hex');
    
    this.verificationToken = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');
    
    this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    
    return verificationToken;
};

// Check if account is locked
userSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
userSchema.methods.incLoginAttempts = async function() {
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 }
        });
    }
    
    const updates = { $inc: { loginAttempts: 1 } };
    
    if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
        updates.$set = { lockUntil: Date.now() + 60 * 60 * 1000 }; // 1 hour
    }
    
    return this.updateOne(updates);
};

// Get dashboard stats (admin)
userSchema.statics.getDashboardStats = async function() {
    const stats = await this.aggregate([
        {
            $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                activeUsers: {
                    $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                },
                totalAdmins: {
                    $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
                },
                totalVerified: {
                    $sum: { $cond: ['$isVerified', 1, 0] }
                },
                totalWalletBalance: { $sum: '$walletBalance' }
            }
        }
    ]);
    
    return stats[0] || {
        totalUsers: 0,
        activeUsers: 0,
        totalAdmins: 0,
        totalVerified: 0,
        totalWalletBalance: 0
    };
};

module.exports = mongoose.model('User', userSchema);