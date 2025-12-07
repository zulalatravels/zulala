const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    getOffers,
    getOffer,
    createOffer,
    updateOffer,
    deleteOffer,
    validateOffer,
    getOfferUsage,
    getUserOffers,
    applyOffer,
    getOfferAnalytics
} = require('../controllers/offerController');
const { protect, authorize } = require('../middleware/auth');

// Validation middleware
const createOfferValidation = [
    body('title').notEmpty().withMessage('Offer title is required'),
    body('description').notEmpty().withMessage('Offer description is required'),
    body('code').notEmpty().withMessage('Offer code is required'),
    body('type').isIn(['percentage', 'fixed', 'free_days', 'combo', 'first_booking', 'seasonal', 'referral', 'loyalty'])
        .withMessage('Invalid offer type'),
    body('discountValue').isNumeric().withMessage('Discount value must be a number'),
    body('validFrom').isISO8601().withMessage('Valid from date is required'),
    body('validUntil').isISO8601().withMessage('Valid until date is required')
];

const validateOfferValidation = [
    body('code').notEmpty().withMessage('Offer code is required'),
    body('carId').optional().isMongoId().withMessage('Invalid car ID'),
    body('totalAmount').optional().isNumeric().withMessage('Total amount must be a number'),
    body('totalDays').optional().isInt({ min: 1 }).withMessage('Total days must be at least 1')
];

const applyOfferValidation = [
    body('bookingId').isMongoId().withMessage('Valid booking ID is required'),
    body('offerCode').notEmpty().withMessage('Offer code is required')
];

// Public routes
router.get('/', getOffers);
router.get('/:id', getOffer);
router.post('/validate', validateOfferValidation, validateOffer);

// Protected routes (user)
router.use(protect);

router.get('/user/active', getUserOffers);
router.post('/apply', applyOfferValidation, applyOffer);

// Admin routes
router.use(authorize('admin', 'super_admin'));

router.post('/', createOfferValidation, createOffer);
router.put('/:id', updateOffer);
router.delete('/:id', deleteOffer);
router.get('/:id/usage', getOfferUsage);
router.get('/:id/analytics', getOfferAnalytics);

module.exports = router;