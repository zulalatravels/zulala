const Car = require('../models/Car');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');

// @desc    Get all cars
// @route   GET /api/cars
// @access  Public
exports.getCars = async (req, res) => {
    try {
        // Copy req.query
        const reqQuery = { ...req.query };
        
        // Fields to exclude
        const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
        removeFields.forEach(param => delete reqQuery[param]);
        
        // Create query string
        let queryStr = JSON.stringify(reqQuery);
        
        // Create operators ($gt, $gte, etc)
        queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
        
        // Build query
        let query = Car.find(JSON.parse(queryStr));
        
        // Search functionality
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query = query.or([
                { make: searchRegex },
                { model: searchRegex },
                { 'location.city': searchRegex },
                { category: searchRegex },
                { tags: searchRegex }
            ]);
        }
        
        // Select fields
        if (req.query.select) {
            const fields = req.query.select.split(',').join(' ');
            query = query.select(fields);
        }
        
        // Sort
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            query = query.sort(sortBy);
        } else {
            query = query.sort('-createdAt');
        }
        
        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const total = await Car.countDocuments(JSON.parse(queryStr));
        
        query = query.skip(startIndex).limit(limit);
        
        // Execute query
        const cars = await query;
        
        // Pagination result
        const pagination = {};
        
        if (endIndex < total) {
            pagination.next = {
                page: page + 1,
                limit
            };
        }
        
        if (startIndex > 0) {
            pagination.prev = {
                page: page - 1,
                limit
            };
        }
        
        res.status(200).json({
            success: true,
            count: cars.length,
            pagination,
            data: cars
        });
    } catch (error) {
        console.error('Get cars error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get single car
// @route   GET /api/cars/:id
// @access  Public
exports.getCar = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        // Check availability for specific dates if provided
        if (req.query.pickupDate && req.query.dropoffDate) {
            const isAvailable = await car.isAvailableForDates(
                new Date(req.query.pickupDate),
                new Date(req.query.dropoffDate)
            );
            
            car.availability = isAvailable ? 'available' : 'booked';
        }
        
        res.status(200).json({
            success: true,
            data: car
        });
    } catch (error) {
        console.error('Get car error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Create new car
// @route   POST /api/cars
// @access  Private/Admin
exports.createCar = async (req, res) => {
    try {
        // Add createdBy
        req.body.createdBy = req.user.id;
        
        // Handle features array
        if (req.body.features) {
            if (typeof req.body.features === 'string') {
                req.body.features = JSON.parse(req.body.features);
            }
        }
        
        const car = await Car.create(req.body);
        
        // Create notification for admin
        await Notification.create({
            user: req.user.id,
            title: 'New Car Added',
            message: `Car ${car.make} ${car.model} has been added to inventory`,
            type: 'system',
            metadata: {
                carId: car._id
            }
        });
        
        res.status(201).json({
            success: true,
            data: car
        });
    } catch (error) {
        console.error('Create car error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update car
// @route   PUT /api/cars/:id
// @access  Private/Admin
exports.updateCar = async (req, res) => {
    try {
        let car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        // Add updatedBy
        req.body.updatedBy = req.user.id;
        
        // Handle features array
        if (req.body.features) {
            if (typeof req.body.features === 'string') {
                req.body.features = JSON.parse(req.body.features);
            }
        }
        
        car = await Car.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        
        // Log price change
        if (req.body.pricePerDay && req.body.pricePerDay !== car.pricePerDay) {
            await Notification.create({
                user: req.user.id,
                title: 'Car Price Updated',
                message: `Price for ${car.make} ${car.model} changed from ₹${car.pricePerDay} to ₹${req.body.pricePerDay}`,
                type: 'system',
                metadata: {
                    carId: car._id,
                    oldPrice: car.pricePerDay,
                    newPrice: req.body.pricePerDay
                }
            });
        }
        
        res.status(200).json({
            success: true,
            data: car
        });
    } catch (error) {
        console.error('Update car error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Delete car
// @route   DELETE /api/cars/:id
// @access  Private/Admin
exports.deleteCar = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        // Check if car has active bookings
        const activeBookings = await Booking.find({
            car: car._id,
            status: { $in: ['confirmed', 'active'] }
        });
        
        if (activeBookings.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete car with active bookings'
            });
        }
        
        // Soft delete by changing status
        car.status = 'deleted';
        await car.save();
        
        // Create notification
        await Notification.create({
            user: req.user.id,
            title: 'Car Deleted',
            message: `Car ${car.make} ${car.model} has been removed from inventory`,
            type: 'system',
            metadata: {
                carId: car._id
            }
        });
        
        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Delete car error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Upload car images
// @route   POST /api/cars/:id/images
// @access  Private/Admin
exports.uploadCarImages = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Please upload at least one image'
            });
        }
        
        // Process uploaded files
        const images = req.files.map((file, index) => ({
            url: file.path || file.url,
            public_id: file.filename || file.public_id,
            caption: req.body.captions ? req.body.captions[index] : '',
            isPrimary: index === 0 && car.images.length === 0 // First image as primary if no images exist
        }));
        
        // Add new images to car
        car.images = [...car.images, ...images];
        await car.save();
        
        res.status(200).json({
            success: true,
            count: images.length,
            data: car.images
        });
    } catch (error) {
        console.error('Upload car images error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Set primary image
// @route   PUT /api/cars/:id/images/primary
// @access  Private/Admin
exports.setPrimaryImage = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        // Find the image
        const image = car.images.id(req.body.imageId);
        
        if (!image) {
            return res.status(404).json({
                success: false,
                error: 'Image not found'
            });
        }
        
        // Set all images to non-primary
        car.images.forEach(img => {
            img.isPrimary = false;
        });
        
        // Set selected image as primary
        image.isPrimary = true;
        
        await car.save();
        
        res.status(200).json({
            success: true,
            data: car.images
        });
    } catch (error) {
        console.error('Set primary image error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Delete car image
// @route   DELETE /api/cars/:id/images/:imageId
// @access  Private/Admin
exports.deleteCarImage = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        // Find the image
        const image = car.images.id(req.params.imageId);
        
        if (!image) {
            return res.status(404).json({
                success: false,
                error: 'Image not found'
            });
        }
        
        // Check if it's the last image
        if (car.images.length === 1) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete the only image'
            });
        }
        
        // If deleting primary image, set another as primary
        if (image.isPrimary) {
            const otherImage = car.images.find(img => img._id.toString() !== req.params.imageId);
            if (otherImage) {
                otherImage.isPrimary = true;
            }
        }
        
        // Remove from array
        car.images.pull({ _id: req.params.imageId });
        await car.save();
        
        // Delete from Cloudinary if public_id exists
        if (image.public_id) {
            const { cloudinary } = require('../config/cloudinary');
            await cloudinary.uploader.destroy(image.public_id);
        }
        
        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Delete car image error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get featured cars
// @route   GET /api/cars/featured
// @access  Public
exports.getFeaturedCars = async (req, res) => {
    try {
        const cars = await Car.getFeaturedCars(req.query.limit || 10);
        
        res.status(200).json({
            success: true,
            count: cars.length,
            data: cars
        });
    } catch (error) {
        console.error('Get featured cars error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get recommended cars
// @route   GET /api/cars/recommended
// @access  Private
exports.getRecommendedCars = async (req, res) => {
    try {
        const userPreferences = {
            category: req.query.category,
            fuelType: req.query.fuelType,
            maxPrice: req.query.maxPrice
        };
        
        const cars = await Car.getRecommendedCars(userPreferences, req.query.limit || 10);
        
        res.status(200).json({
            success: true,
            count: cars.length,
            data: cars
        });
    } catch (error) {
        console.error('Get recommended cars error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Check car availability
// @route   POST /api/cars/:id/check-availability
// @access  Public
exports.checkAvailability = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        const { pickupDate, dropoffDate } = req.body;
        
        if (!pickupDate || !dropoffDate) {
            return res.status(400).json({
                success: false,
                error: 'Please provide pickup and dropoff dates'
            });
        }
        
        const isAvailable = await car.isAvailableForDates(
            new Date(pickupDate),
            new Date(dropoffDate)
        );
        
        // Calculate price
        const start = new Date(pickupDate);
        const end = new Date(dropoffDate);
        const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        
        const price = car.calculateRentalPrice(totalDays);
        
        res.status(200).json({
            success: true,
            data: {
                isAvailable,
                carId: car._id,
                carName: `${car.make} ${car.model}`,
                pickupDate,
                dropoffDate,
                totalDays,
                pricePerDay: car.pricePerDay,
                totalPrice: price,
                securityDeposit: car.securityDeposit
            }
        });
    } catch (error) {
        console.error('Check availability error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get car statistics
// @route   GET /api/cars/:id/stats
// @access  Private/Admin
exports.getCarStats = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        // Get booking statistics for this car
        const bookingStats = await Booking.aggregate([
            {
                $match: { 
                    car: car._id,
                    status: { $in: ['completed', 'active'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalBookings: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' },
                    avgBookingDuration: { $avg: '$totalDays' },
                    lastBooking: { $max: '$createdAt' }
                }
            }
        ]);
        
        // Get monthly revenue
        const monthlyRevenue = await Booking.aggregate([
            {
                $match: { 
                    car: car._id,
                    status: 'completed',
                    createdAt: { 
                        $gte: new Date(new Date().setMonth(new Date().getMonth() - 6))
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    revenue: { $sum: '$totalAmount' },
                    bookings: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);
        
        // Get availability percentage
        const totalDays = 30; // Last 30 days
        const unavailableDays = await Booking.countDocuments({
            car: car._id,
            status: { $in: ['confirmed', 'active'] },
            pickupDate: { $lte: new Date() },
            dropoffDate: { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) }
        });
        
        const availabilityPercentage = ((totalDays - unavailableDays) / totalDays) * 100;
        
        res.status(200).json({
            success: true,
            data: {
                car: {
                    make: car.make,
                    model: car.model,
                    licensePlate: car.licensePlate,
                    totalBookings: car.totalBookings,
                    totalRevenue: car.totalRevenue,
                    rating: car.rating,
                    status: car.status
                },
                stats: bookingStats[0] || {
                    totalBookings: 0,
                    totalRevenue: 0,
                    avgBookingDuration: 0,
                    lastBooking: null
                },
                monthlyRevenue,
                availability: {
                    percentage: availabilityPercentage.toFixed(2),
                    status: car.availability
                },
                maintenance: car.maintenance
            }
        });
    } catch (error) {
        console.error('Get car stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update car maintenance
// @route   PUT /api/cars/:id/maintenance
// @access  Private/Admin
exports.updateMaintenance = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        
        if (!car) {
            return res.status(404).json({
                success: false,
                error: 'Car not found'
            });
        }
        
        // Update maintenance
        if (req.body.lastService) {
            car.maintenance.lastService = req.body.lastService;
        }
        
        if (req.body.nextService) {
            car.maintenance.nextService = req.body.nextService;
        }
        
        if (req.body.currentMileage) {
            car.maintenance.currentMileage = req.body.currentMileage;
        }
        
        if (req.body.fuelLevel) {
            car.maintenance.fuelLevel = req.body.fuelLevel;
        }
        
        // Add service history if provided
        if (req.body.serviceHistory) {
            const serviceEntry = {
                date: new Date(),
                type: req.body.serviceHistory.type,
                details: req.body.serviceHistory.details,
                cost: req.body.serviceHistory.cost,
                mileage: req.body.serviceHistory.mileage,
                workshop: req.body.serviceHistory.workshop
            };
            
            car.maintenance.serviceHistory.unshift(serviceEntry);
        }
        
        // Update availability if under maintenance
        if (req.body.underMaintenance) {
            car.availability = 'maintenance';
            car.status = 'inactive';
        }
        
        await car.save();
        
        // Create notification
        await Notification.create({
            user: req.user.id,
            title: 'Maintenance Updated',
            message: `Maintenance updated for ${car.make} ${car.model}`,
            type: 'system',
            metadata: {
                carId: car._id,
                maintenanceType: req.body.serviceHistory?.type
            }
        });
        
        res.status(200).json({
            success: true,
            data: car.maintenance
        });
    } catch (error) {
        console.error('Update maintenance error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Search cars by location
// @route   GET /api/cars/search/location
// @access  Public
exports.searchByLocation = async (req, res) => {
    try {
        const { city, lat, lng, radius = 10 } = req.query;
        
        let query = {
            status: 'active',
            availability: 'available'
        };
        
        // Search by city name
        if (city) {
            query['location.city'] = new RegExp(city, 'i');
        }
        
        // Search by coordinates (geospatial search)
        if (lat && lng) {
            query['location.coordinates'] = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: radius * 1000 // Convert km to meters
                }
            };
        }
        
        const cars = await Car.find(query)
            .limit(50)
            .select('make model images pricePerDay location rating');
        
        res.status(200).json({
            success: true,
            count: cars.length,
            data: cars
        });
    } catch (error) {
        console.error('Search by location error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get car categories
// @route   GET /api/cars/categories
// @access  Public
exports.getCategories = async (req, res) => {
    try {
        const categories = await Car.aggregate([
            {
                $match: {
                    status: 'active',
                    availability: 'available'
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    minPrice: { $min: '$pricePerDay' },
                    maxPrice: { $max: '$pricePerDay' },
                    avgPrice: { $avg: '$pricePerDay' },
                    avgRating: { $avg: '$rating.average' }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
        
        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};