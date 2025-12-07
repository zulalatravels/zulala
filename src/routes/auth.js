const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    register,
    login,
    getMe,
    updateDetails,
    updatePassword,
    forgotPassword,
    resetPassword,
    verifyEmail,
    logout,
    getReferralDetails,
    requestPhoneVerification,
    verifyPhone,
    uploadProfilePicture
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { profilePicture } = require('../middleware/upload');

// Validation middleware
const registerValidation = [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please include a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone').matches(/^[0-9]{10}$/).withMessage('Please enter a valid 10-digit phone number'),
    body('driverLicense').notEmpty().withMessage('Driver license is required')
];

const loginValidation = [
    body('email').isEmail().withMessage('Please include a valid email'),
    body('password').notEmpty().withMessage('Password is required')
];

const updatePasswordValidation = [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
];

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/forgotpassword', 
    body('email').isEmail().withMessage('Please include a valid email'),
    forgotPassword
);
router.put('/resetpassword/:resettoken', 
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    resetPassword
);
router.get('/verifyemail/:token', verifyEmail);

// Protected routes
router.use(protect);

router.get('/me', getMe);
router.put('/updatedetails', updateDetails);
router.put('/updatepassword', updatePasswordValidation, updatePassword);
router.get('/logout', logout);
router.get('/referral', getReferralDetails);
router.post('/request-phone-verification', requestPhoneVerification);
router.post('/verify-phone', 
    body('otp').matches(/^[0-9]{6}$/).withMessage('Please enter a valid 6-digit OTP'),
    verifyPhone
);
router.post('/upload-profile', profilePicture, uploadProfilePicture);

module.exports = router;