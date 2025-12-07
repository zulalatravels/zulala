const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify token
exports.protect = async (req, res, next) => {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // Check for token in cookies
    else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Not authorized to access this route'
        });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        req.user = await User.findById(decoded.id).select('-password');
        
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Check if user is active
        if (req.user.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'Your account has been suspended'
            });
        }
        
        // Check if user is verified (optional for some routes)
        // if (!req.user.isVerified) {
        //     return res.status(403).json({
        //         success: false,
        //         error: 'Please verify your email first'
        //     });
        // }
        
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: 'Not authorized to access this route'
        });
    }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `User role ${req.user.role} is not authorized to access this route`
            });
        }
        next();
    };
};

// Optional authentication (for public routes that optionally show user data)
exports.optionalAuth = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        next();
    } catch (err) {
        req.user = null;
        next();
    }
};

// API key authentication for external services
exports.apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required'
        });
    }
    
    // Validate API key (store in environment variable)
    if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({
            success: false,
            error: 'Invalid API key'
        });
    }
    
    next();
};

// Rate limiting for specific routes
exports.rateLimit = (options = {}) => {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutes
        max = 100, // limit each IP to 100 requests per windowMs
        message = 'Too many requests, please try again later'
    } = options;
    
    const rateLimit = require('express-rate-limit');
    
    return rateLimit({
        windowMs,
        max,
        message: {
            success: false,
            error: message
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            return req.user ? req.user.id : req.ip;
        }
    });
};

// Validate request body
exports.validateRequest = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }
        
        next();
    };
};

// Check if user owns resource
exports.checkOwnership = (model, paramName = 'id') => {
    return async (req, res, next) => {
        try {
            const resource = await model.findById(req.params[paramName]);
            
            if (!resource) {
                return res.status(404).json({
                    success: false,
                    error: 'Resource not found'
                });
            }
            
            // Check if user owns resource or is admin
            if (resource.user.toString() !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Not authorized to access this resource'
                });
            }
            
            req.resource = resource;
            next();
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    };
};

// Check resource existence
exports.checkExistence = (model, paramName = 'id') => {
    return async (req, res, next) => {
        try {
            const resource = await model.findById(req.params[paramName]);
            
            if (!resource) {
                return res.status(404).json({
                    success: false,
                    error: 'Resource not found'
                });
            }
            
            req.resource = resource;
            next();
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    };
};

// File upload validation
exports.validateFile = (options = {}) => {
    const {
        allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
        maxSize = 5 * 1024 * 1024, // 5MB
        fieldName = 'file'
    } = options;
    
    return (req, res, next) => {
        if (!req.file) {
            return next();
        }
        
        // Check file type
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
            });
        }
        
        // Check file size
        if (req.file.size > maxSize) {
            return res.status(400).json({
                success: false,
                error: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB`
            });
        }
        
        next();
    };
};

// CORS middleware
exports.corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://your-frontend-domain.com',
            process.env.FRONTEND_URL
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

// Request logging middleware
exports.requestLogger = (req, res, next) => {
    console.log(`${req.method} ${req.originalUrl} - ${req.ip} - ${new Date().toISOString()}`);
    
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request Body:', JSON.stringify(req.body, null, 2));
    }
    
    if (req.query && Object.keys(req.query).length > 0) {
        console.log('Query Params:', JSON.stringify(req.query, null, 2));
    }
    
    // Capture response
    const oldSend = res.send;
    res.send = function(data) {
        console.log('Response:', JSON.parse(data));
        oldSend.apply(res, arguments);
    };
    
    next();
};

// Error handling middleware
exports.errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);
    
    let error = { ...err };
    error.message = err.message;
    
    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = { message, statusCode: 404 };
    }
    
    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = { message, statusCode: 400 };
    }
    
    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = { message, statusCode: 400 };
    }
    
    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = { message, statusCode: 401 };
    }
    
    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = { message, statusCode: 401 };
    }
    
    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Server Error'
    });
};