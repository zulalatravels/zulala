const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// File filter
const fileFilter = (req, file, cb) => {
    // Allowed ext
    const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    // Check mime
    const mimetype = filetypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Error: Images and documents only!'));
    }
};

// Storage configuration
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        let folder = 'general';
        
        if (req.baseUrl.includes('cars')) {
            folder = 'cars';
        } else if (req.baseUrl.includes('users')) {
            folder = 'users';
        } else if (req.baseUrl.includes('bookings')) {
            folder = 'bookings';
        }
        
        const dir = `uploads/${folder}`;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        cb(null, dir);
    },
    filename: function(req, file, cb) {
        // Create unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Upload configuration for different file types
const uploadConfig = {
    // Single image upload
    singleImage: multer({
        storage: storage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Please upload only images'), false);
            }
        }
    }).single('image'),
    
    // Multiple images upload
    multipleImages: multer({
        storage: storage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB total
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Please upload only images'), false);
            }
        }
    }).array('images', 10), // Max 10 images
    
    // Document upload
    document: multer({
        storage: storage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            const allowedTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg',
                'image/png'
            ];
            
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Please upload only PDF, Word docs, or images'), false);
            }
        }
    }).single('document'),
    
    // Mixed upload (images + documents)
    mixedUpload: multer({
        storage: storage,
        limits: { fileSize: 20 * 1024 * 1024 } // 20MB
    }).fields([
        { name: 'images', maxCount: 5 },
        { name: 'documents', maxCount: 3 }
    ]),
    
    // Profile picture upload
    profilePicture: multer({
        storage: storage,
        limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                // Check if it's a valid image for profile
                const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
                if (allowedTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error('Please upload only JPG, PNG, or GIF images'), false);
                }
            } else {
                cb(new Error('Please upload only images'), false);
            }
        }
    }).single('profilePicture'),
    
    // Car images upload
    carImages: multer({
        storage: storage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Please upload only images'), false);
            }
        }
    }).array('carImages', 8) // Max 8 images
};

// Middleware to handle upload errors
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Please upload a smaller file.'
            });
        }
        
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files. Please upload fewer files.'
            });
        }
        
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                error: 'Unexpected file field. Please check your upload.'
            });
        }
    }
    
    if (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
    
    next();
};

// Cloudinary upload middleware
const { carImageStorage, userImageStorage, documentStorage } = require('../config/cloudinary');

const cloudinaryUpload = {
    // Upload to Cloudinary instead of local storage
    carImagesToCloudinary: multer({ 
        storage: carImageStorage,
        limits: { fileSize: 5 * 1024 * 1024 }
    }).array('images', 8),
    
    profileToCloudinary: multer({
        storage: userImageStorage,
        limits: { fileSize: 2 * 1024 * 1024 }
    }).single('profileImage'),
    
    documentsToCloudinary: multer({
        storage: documentStorage,
        limits: { fileSize: 10 * 1024 * 1024 }
    }).single('document')
};

// Cleanup uploaded files middleware
const cleanupUploads = (req, res, next) => {
    // Cleanup uploaded files after response is sent
    res.on('finish', () => {
        if (req.files) {
            Object.values(req.files).forEach(fileArray => {
                if (Array.isArray(fileArray)) {
                    fileArray.forEach(file => {
                        if (file.path && fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                        }
                    });
                }
            });
        }
        
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
    });
    
    next();
};

module.exports = {
    ...uploadConfig,
    ...cloudinaryUpload,
    handleUploadError,
    cleanupUploads
};