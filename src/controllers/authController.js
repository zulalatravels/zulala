const User = require('../models/User');
const Referral = require('../models/Referral');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');
const { sendSMS } = require('../utils/smsService');
const crypto = require('crypto');

// Generate JWT Token
const generateToken = (user) => {
    return user.generateAuthToken();
};

// Send token response
const sendTokenResponse = (user, statusCode, res) => {
    // Create token
    const token = generateToken(user);
    
    // Cookie options
    const options = {
        expires: new Date(
            Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    };
    
    // Update last login
    user.lastLogin = Date.now();
    user.save();
    
    // Remove password from output
    user.password = undefined;
    
    res.status(statusCode)
        .cookie('token', token, options)
        .json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                profileImage: user.profileImage,
                walletBalance: user.walletBalance,
                referralCode: user.referralCode
            }
        });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { 
            name, 
            email, 
            password, 
            phone, 
            driverLicense,
            referralCode 
        } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { phone }] 
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'User with this email or phone already exists'
            });
        }
        
        // Create user
        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password,
            phone,
            driverLicense
        });
        
        // Handle referral
        if (referralCode) {
            const referrer = await User.findOne({ referralCode });
            if (referrer) {
                user.referredBy = referrer._id;
                await user.save();
                
                // Create referral record
                const referral = await Referral.create({
                    referrer: referrer._id,
                    referredUser: user._id,
                    referralCode,
                    status: 'pending'
                });
                
                // Send notification to referrer
                await Notification.create({
                    user: referrer._id,
                    title: 'New Referral!',
                    message: `${user.name} signed up using your referral code`,
                    type: 'referral',
                    metadata: {
                        referralId: referral._id,
                        referredUserId: user._id
                    }
                });
            }
        }
        
        // Generate verification token
        const verificationToken = user.generateVerificationToken();
        await user.save();
        
        // Send verification email
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
        
        await sendEmail({
            email: user.email,
            subject: 'Verify Your Email - Car Rental',
            template: 'emailVerification',
            context: {
                userName: user.name,
                verificationUrl,
                supportEmail: process.env.SUPPORT_EMAIL
            }
        });
        
        // Send welcome SMS
        await sendSMS({
            to: user.phone,
            message: `Welcome to Car Rental, ${user.name}! Your account has been created successfully.`
        });
        
        // Create welcome notification
        await Notification.create({
            user: user._id,
            title: 'Welcome to Car Rental!',
            message: 'Your account has been created. Please verify your email to get started.',
            type: 'system',
            sendEmail: true
        });
        
        // Send token response
        sendTokenResponse(user, 201, res);
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validate email & password
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Please provide email and password'
            });
        }
        
        // Check for user with email
        const user = await User.findOne({ email: email.toLowerCase() })
            .select('+password +loginAttempts +lockUntil');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        // Check if account is locked
        if (user.isLocked()) {
            return res.status(423).json({
                success: false,
                error: 'Account is locked. Try again later.'
            });
        }
        
        // Check if password matches
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            // Increment login attempts
            await user.incLoginAttempts();
            
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        // Check if email is verified
        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                error: 'Please verify your email first',
                requiresVerification: true
            });
        }
        
        // Check if account is active
        if (user.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'Your account has been suspended'
            });
        }
        
        // Reset login attempts on successful login
        await User.findByIdAndUpdate(user._id, {
            $set: { loginAttempts: 0 },
            $unset: { lockUntil: 1 }
        });
        
        // Send token response
        sendTokenResponse(user, 200, res);
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password')
            .populate('referredBy', 'name email');
        
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update user details
// @route   PUT /api/auth/updatedetails
// @access  Private
exports.updateDetails = async (req, res) => {
    try {
        const fieldsToUpdate = {
            name: req.body.name,
            phone: req.body.phone,
            address: req.body.address
        };
        
        // Remove undefined fields
        Object.keys(fieldsToUpdate).forEach(key => 
            fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
        );
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            fieldsToUpdate,
            {
                new: true,
                runValidators: true
            }
        ).select('-password');
        
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('+password');
        
        // Check current password
        const isMatch = await user.comparePassword(req.body.currentPassword);
        
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }
        
        user.password = req.body.newPassword;
        await user.save();
        
        // Send email notification
        await sendEmail({
            email: user.email,
            subject: 'Password Changed - Car Rental',
            template: 'passwordChanged',
            context: {
                userName: user.name
            }
        });
        
        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Forgot password
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'No user found with that email'
            });
        }
        
        // Get reset token
        const resetToken = user.generatePasswordResetToken();
        await user.save({ validateBeforeSave: false });
        
        // Create reset URL
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        
        // Send email
        await sendEmail({
            email: user.email,
            subject: 'Password Reset Request - Car Rental',
            template: 'passwordReset',
            context: {
                userName: user.name,
                resetUrl,
                expiryTime: '10 minutes'
            }
        });
        
        res.status(200).json({
            success: true,
            message: 'Email sent with reset instructions'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        
        // Reset token if email fails
        if (user) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save({ validateBeforeSave: false });
        }
        
        res.status(500).json({
            success: false,
            error: 'Email could not be sent'
        });
    }
};

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = async (req, res) => {
    try {
        // Get hashed token
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');
        
        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }
        
        // Set new password
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();
        
        // Send email notification
        await sendEmail({
            email: user.email,
            subject: 'Password Reset Successful - Car Rental',
            template: 'passwordResetSuccess',
            context: {
                userName: user.name
            }
        });
        
        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Verify email
// @route   GET /api/auth/verifyemail/:token
// @access  Public
exports.verifyEmail = async (req, res) => {
    try {
        // Get hashed token
        const verificationToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');
        
        const user = await User.findOne({
            verificationToken,
            verificationTokenExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired verification token'
            });
        }
        
        // Verify user
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();
        
        // Process referral if applicable
        if (user.referredBy) {
            const referrer = await User.findById(user.referredBy);
            if (referrer) {
                referrer.walletBalance += parseInt(process.env.REFERRAL_REWARD);
                referrer.referralPoints += parseInt(process.env.REFERRAL_REWARD);
                referrer.totalReferrals += 1;
                await referrer.save();
                
                // Update referral status
                await Referral.findOneAndUpdate(
                    { referrer: referrer._id, referredUser: user._id },
                    { status: 'completed', completedAt: new Date() }
                );
                
                // Send notification to referrer
                await Notification.create({
                    user: referrer._id,
                    title: 'Referral Reward!',
                    message: `You earned ₹${process.env.REFERRAL_REWARD} for referring ${user.name}`,
                    type: 'referral',
                    metadata: {
                        amount: process.env.REFERRAL_REWARD,
                        referredUserName: user.name
                    }
                });
            }
        }
        
        // Send welcome email
        await sendEmail({
            email: user.email,
            subject: 'Email Verified Successfully - Car Rental',
            template: 'emailVerified',
            context: {
                userName: user.name,
                referralCode: user.referralCode
            }
        });
        
        // Create notification
        await Notification.create({
            user: user._id,
            title: 'Email Verified!',
            message: 'Your email has been verified successfully. Start booking cars now!',
            type: 'system',
            metadata: {
                referralCode: user.referralCode
            }
        });
        
        // Redirect to frontend or send success response
        res.status(200).json({
            success: true,
            message: 'Email verified successfully'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Logout user / clear cookie
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
    res.cookie('token', 'none', {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true
    });
    
    res.status(200).json({
        success: true,
        data: {}
    });
};

// @desc    Get referral details
// @route   GET /api/auth/referral
// @access  Private
exports.getReferralDetails = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('referralCode referralPoints totalReferrals walletBalance');
        
        const referrals = await Referral.find({ referrer: req.user.id })
            .populate('referredUser', 'name email createdAt')
            .sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            data: {
                referralCode: user.referralCode,
                referralPoints: user.referralPoints,
                totalReferrals: user.totalReferrals,
                walletBalance: user.walletBalance,
                referralLink: `${process.env.FRONTEND_URL}/register?ref=${user.referralCode}`,
                referrals
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Request phone verification OTP
// @route   POST /api/auth/request-phone-verification
// @access  Private
exports.requestPhoneVerification = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        
        // Save OTP to user
        user.phoneVerificationOTP = otp;
        user.phoneVerificationExpires = otpExpires;
        await user.save();
        
        // Send OTP via SMS
        await sendSMS({
            to: user.phone,
            message: `Your Car Rental verification OTP is ${otp}. It will expire in 10 minutes.`
        });
        
        res.status(200).json({
            success: true,
            message: 'OTP sent to your phone'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Verify phone with OTP
// @route   POST /api/auth/verify-phone
// @access  Private
exports.verifyPhone = async (req, res) => {
    try {
        const { otp } = req.body;
        const user = await User.findById(req.user.id);
        
        // Check OTP
        if (user.phoneVerificationOTP !== otp) {
            return res.status(400).json({
                success: false,
                error: 'Invalid OTP'
            });
        }
        
        // Check expiry
        if (user.phoneVerificationExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                error: 'OTP has expired'
            });
        }
        
        // Verify phone
        user.isPhoneVerified = true;
        user.phoneVerificationOTP = undefined;
        user.phoneVerificationExpires = undefined;
        await user.save();
        
        // Create notification
        await Notification.create({
            user: user._id,
            title: 'Phone Verified!',
            message: 'Your phone number has been verified successfully.',
            type: 'system'
        });
        
        res.status(200).json({
            success: true,
            message: 'Phone verified successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Upload profile picture
// @route   POST /api/auth/upload-profile
// @access  Private
exports.uploadProfilePicture = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Please upload an image'
            });
        }
        
        // Update profile image
        user.profileImage = {
            url: req.file.path,
            public_id: req.file.filename
        };
        
        await user.save();
        
        res.status(200).json({
            success: true,
            data: user.profileImage
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};