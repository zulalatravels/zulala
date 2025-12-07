const { body } = require('express-validator');
const express = require('express');
const router = express.Router();
const {
    getCars,
    getCar,
    createCar,
    updateCar,
    deleteCar,
    uploadCarImages,
    setPrimaryImage,
    deleteCarImage,
    getFeaturedCars,
    getRecommendedCars,
    checkAvailability,
    getCarStats,
    updateMaintenance,
    searchByLocation,
    getCategories
} = require('../controllers/carController');
const { protect, authorize } = require('../middleware/auth');
const { carImages, handleUploadError } = require('../middleware/upload');

// Public routes
router.get('/', getCars);
router.get('/featured', getFeaturedCars);
router.get('/categories', getCategories);
router.get('/search/location', searchByLocation);
router.get('/:id', getCar);
router.post('/:id/check-availability', checkAvailability);

// Protected routes
router.use(protect);

router.get('/recommended', getRecommendedCars);

// Admin routes
router.use(authorize('admin', 'super_admin'));

router.post('/', 
    body('make').notEmpty().withMessage('Car make is required'),
    body('model').notEmpty().withMessage('Car model is required'),
    body('licensePlate').notEmpty().withMessage('License plate is required'),
    body('pricePerDay').isNumeric().withMessage('Price per day must be a number'),
    createCar
);

router.put('/:id', updateCar);
router.delete('/:id', deleteCar);
router.post('/:id/images', carImages, handleUploadError, uploadCarImages);
router.put('/:id/images/primary', setPrimaryImage);
router.delete('/:id/images/:imageId', deleteCarImage);
router.get('/:id/stats', getCarStats);
router.put('/:id/maintenance', updateMaintenance);

module.exports = router;