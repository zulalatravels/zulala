const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    createBooking,
    getMyBookings,
    getBooking,
    getUpcomingBookings,
    cancelBooking,
    updateBooking,
    getAllBookings,
    getBookingStats,
    processReturn,
    getBookingInvoice,
    addReview,
    getBookingCalendar,
    extendBooking
} = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');

// Validation middleware
const createBookingValidation = [
    body('carId').notEmpty().withMessage('Car ID is required'),
    body('pickupDate').isISO8601().withMessage('Valid pickup date is required'),
    body('dropoffDate').isISO8601().withMessage('Valid dropoff date is required'),
    body('pickupLocation').notEmpty().withMessage('Pickup location is required'),
    body('dropoffLocation').notEmpty().withMessage('Dropoff location is required'),
    body('driverDetails.name').notEmpty().withMessage('Driver name is required'),
    body('driverDetails.licenseNumber').notEmpty().withMessage('Driver license number is required')
];

const cancelBookingValidation = [
    body('reason').optional().isString().withMessage('Reason must be a string')
];

const reviewValidation = [
    body('rating').isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().isString().withMessage('Comment must be a string')
];

const extendBookingValidation = [
    body('newDropoffDate').isISO8601().withMessage('Valid dropoff date is required'),
    body('reason').notEmpty().withMessage('Reason is required')
];

// Protected routes (user)
router.use(protect);

router.post('/', createBookingValidation, createBooking);
router.get('/mybookings', getMyBookings);
router.get('/upcoming', getUpcomingBookings);
router.get('/:id', getBooking);
router.put('/:id/cancel', cancelBookingValidation, cancelBooking);
router.get('/:id/invoice', getBookingInvoice);
router.post('/:id/review', reviewValidation, addReview);
router.get('/calendar/:carId', getBookingCalendar);
router.post('/:id/extend', extendBookingValidation, extendBooking);

// Admin routes
router.use(authorize('admin', 'super_admin'));

router.get('/', getAllBookings);
router.get('/stats', getBookingStats);
router.put('/:id', updateBooking);
router.post('/:id/return', processReturn);

module.exports = router;