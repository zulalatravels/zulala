const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure storage for different file types
const carImageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'car-rental/cars',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1200, height: 800, crop: 'fill' }]
    }
});

const userImageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'car-rental/users',
        allowed_formats: ['jpg', 'jpeg', 'png'],
        transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }]
    }
});

const documentStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'car-rental/documents',
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
        resource_type: 'auto'
    }
});

module.exports = {
    cloudinary,
    carImageStorage,
    userImageStorage,
    documentStorage
};