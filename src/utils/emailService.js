const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify connection
transporter.verify(function(error, success) {
    if (error) {
        console.error('Email server connection error:', error);
    } else {
        console.log('✅ Email server is ready to send messages');
    }
});

// Load email templates
const templates = {};

// Load all template files
const templatesDir = path.join(__dirname, '../templates/emails');
if (fs.existsSync(templatesDir)) {
    fs.readdirSync(templatesDir).forEach(file => {
        if (file.endsWith('.html')) {
            const templateName = file.replace('.html', '');
            const templatePath = path.join(templatesDir, file);
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            templates[templateName] = handlebars.compile(templateContent);
        }
    });
}

// Default email templates if files don't exist
const defaultTemplates = {
    emailVerification: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { padding: 30px; background: #f9f9f9; }
                .button { display: inline-block; padding: 12px 24px; background: #4CAF50; 
                         color: white; text-decoration: none; border-radius: 4px; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; 
                         color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Car Rental Service</h1>
                </div>
                <div class="content">
                    <h2>Verify Your Email Address</h2>
                    <p>Hello {{userName}},</p>
                    <p>Thank you for registering with Car Rental Service. Please verify your email address by clicking the button below:</p>
                    <p style="text-align: center;">
                        <a href="{{verificationUrl}}" class="button">Verify Email</a>
                    </p>
                    <p>If the button doesn't work, copy and paste this link in your browser:</p>
                    <p>{{verificationUrl}}</p>
                    <p>This link will expire in 24 hours.</p>
                    <p>If you didn't create an account, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>© {{year}} Car Rental Service. All rights reserved.</p>
                    <p>Need help? Contact us at {{supportEmail}}</p>
                </div>
            </div>
        </body>
        </html>
    `,
    
    bookingConfirmation: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
                .content { padding: 30px; background: #f9f9f9; }
                .booking-details { background: white; border: 1px solid #ddd; padding: 20px; margin: 20px 0; }
                .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
                .detail-label { font-weight: bold; color: #666; }
                .detail-value { color: #333; }
                .button { display: inline-block; padding: 12px 24px; background: #2196F3; 
                         color: white; text-decoration: none; border-radius: 4px; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; 
                         color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Booking Confirmation</h1>
                </div>
                <div class="content">
                    <h2>Hello {{userName}},</h2>
                    <p>Your booking has been confirmed! Here are your booking details:</p>
                    
                    <div class="booking-details">
                        <div class="detail-row">
                            <span class="detail-label">Booking Number:</span>
                            <span class="detail-value">{{bookingNumber}}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Car:</span>
                            <span class="detail-value">{{carDetails}}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Pickup Date:</span>
                            <span class="detail-value">{{pickupDate}}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Dropoff Date:</span>
                            <span class="detail-value">{{dropoffDate}}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Total Days:</span>
                            <span class="detail-value">{{totalDays}} days</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Total Amount:</span>
                            <span class="detail-value">₹{{totalAmount}}</span>
                        </div>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="{{invoiceUrl}}" class="button">Download Invoice</a>
                    </p>
                    
                    <p><strong>Important Notes:</strong></p>
                    <ul>
                        <li>Please bring your driving license and ID proof at the time of pickup</li>
                        <li>The car will be thoroughly inspected before handover</li>
                        <li>Fuel policy: Full-to-full</li>
                        <li>For any queries, call us at {{supportPhone}}</li>
                    </ul>
                    
                    <p>Thank you for choosing Car Rental Service!</p>
                </div>
                <div class="footer">
                    <p>© {{year}} Car Rental Service. All rights reserved.</p>
                    <p>This is an automated email, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
    `,
    
    passwordReset: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
                .content { padding: 30px; background: #f9f9f9; }
                .button { display: inline-block; padding: 12px 24px; background: #FF9800; 
                         color: white; text-decoration: none; border-radius: 4px; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; 
                         color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset Request</h1>
                </div>
                <div class="content">
                    <h2>Hello {{userName}},</h2>
                    <p>We received a request to reset your password for your Car Rental Service account.</p>
                    <p>Click the button below to reset your password:</p>
                    
                    <p style="text-align: center;">
                        <a href="{{resetUrl}}" class="button">Reset Password</a>
                    </p>
                    
                    <p>If the button doesn't work, copy and paste this link in your browser:</p>
                    <p>{{resetUrl}}</p>
                    
                    <p><strong>Important:</strong> This password reset link will expire in {{expiryTime}}.</p>
                    <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
                </div>
                <div class="footer">
                    <p>© {{year}} Car Rental Service. All rights reserved.</p>
                    <p>Need help? Contact us at {{supportEmail}}</p>
                </div>
            </div>
        </body>
        </html>
    `
};

// Compile default templates
Object.keys(defaultTemplates).forEach(templateName => {
    if (!templates[templateName]) {
        templates[templateName] = handlebars.compile(defaultTemplates[templateName]);
    }
});

/**
 * Send email with template
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.template - Template name
 * @param {Object} options.context - Template context
 * @param {Array} options.attachments - Email attachments
 */
exports.sendEmail = async (options) => {
    try {
        const { email, subject, template, context = {}, attachments = [] } = options;
        
        // Get template
        const templateFn = templates[template];
        if (!templateFn) {
            throw new Error(`Template "${template}" not found`);
        }
        
        // Prepare context with default values
        const emailContext = {
            year: new Date().getFullYear(),
            supportEmail: process.env.SUPPORT_EMAIL || 'support@carrental.com',
            supportPhone: process.env.SUPPORT_PHONE || '+91 9876543210',
            ...context
        };
        
        // Generate HTML from template
        const html = templateFn(emailContext);
        
        // Email options
        const mailOptions = {
            from: `"Car Rental Service" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: html,
            attachments: attachments
        };
        
        // Send email
        const info = await transporter.sendMail(mailOptions);
        
        console.log(`✅ Email sent to ${email}: ${info.messageId}`);
        return info;
        
    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error;
    }
};

/**
 * Send email with custom HTML
 * @param {Object} options - Email options
 */
exports.sendCustomEmail = async (options) => {
    try {
        const { email, subject, html, attachments = [] } = options;
        
        const mailOptions = {
            from: `"Car Rental Service" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: html,
            attachments: attachments
        };
        
        const info = await transporter.sendMail(mailOptions);
        
        console.log(`✅ Custom email sent to ${email}: ${info.messageId}`);
        return info;
        
    } catch (error) {
        console.error('❌ Error sending custom email:', error);
        throw error;
    }
};

/**
 * Send bulk emails
 * @param {Array} recipients - Array of recipient emails
 * @param {Object} emailData - Email data
 */
exports.sendBulkEmail = async (recipients, emailData) => {
    try {
        const { subject, template, context = {} } = emailData;
        
        const templateFn = templates[template];
        if (!templateFn) {
            throw new Error(`Template "${template}" not found`);
        }
        
        const results = [];
        
        for (const email of recipients) {
            try {
                const emailContext = {
                    year: new Date().getFullYear(),
                    supportEmail: process.env.SUPPORT_EMAIL,
                    ...context
                };
                
                const html = templateFn(emailContext);
                
                const mailOptions = {
                    from: `"Car Rental Service" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: subject,
                    html: html
                };
                
                const info = await transporter.sendMail(mailOptions);
                results.push({ email, success: true, messageId: info.messageId });
                
            } catch (error) {
                console.error(`Failed to send email to ${email}:`, error.message);
                results.push({ email, success: false, error: error.message });
            }
        }
        
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`✅ Bulk email sent: ${successful} successful, ${failed} failed`);
        return results;
        
    } catch (error) {
        console.error('❌ Error sending bulk emails:', error);
        throw error;
    }
};

/**
 * Generate and send invoice email
 * @param {Object} booking - Booking object
 * @param {string} invoiceUrl - Invoice URL
 */
exports.sendInvoiceEmail = async (booking, invoiceUrl) => {
    try {
        const User = require('../models/User');
        const Car = require('../models/Car');
        
        const user = await User.findById(booking.user);
        const car = await Car.findById(booking.car);
        
        const context = {
            userName: user.name,
            bookingNumber: booking.bookingNumber,
            carDetails: `${car.make} ${car.model}`,
            pickupDate: booking.pickupDate.toLocaleDateString(),
            dropoffDate: booking.dropoffDate.toLocaleDateString(),
            totalDays: booking.totalDays,
            totalAmount: booking.totalAmount,
            invoiceUrl: invoiceUrl
        };
        
        await this.sendEmail({
            email: user.email,
            subject: `Invoice #${booking.bookingNumber} - Car Rental Service`,
            template: 'invoice',
            context: context
        });
        
    } catch (error) {
        console.error('Error sending invoice email:', error);
        throw error;
    }
};

/**
 * Send welcome email to new user
 * @param {Object} user - User object
 */
exports.sendWelcomeEmail = async (user) => {
    try {
        const context = {
            userName: user.name,
            referralCode: user.referralCode,
            referralLink: `${process.env.FRONTEND_URL}/register?ref=${user.referralCode}`
        };
        
        await this.sendEmail({
            email: user.email,
            subject: 'Welcome to Car Rental Service!',
            template: 'welcome',
            context: context
        });
        
    } catch (error) {
        console.error('Error sending welcome email:', error);
        throw error;
    }
};

/**
 * Send booking reminder email
 * @param {Object} booking - Booking object
 */
exports.sendBookingReminder = async (booking) => {
    try {
        const User = require('../models/User');
        const Car = require('../models/Car');
        
        const user = await User.findById(booking.user);
        const car = await Car.findById(booking.car);
        
        const hoursUntilPickup = Math.floor(
            (booking.pickupDate - new Date()) / (1000 * 60 * 60)
        );
        
        const context = {
            userName: user.name,
            bookingNumber: booking.bookingNumber,
            carDetails: `${car.make} ${car.model}`,
            pickupDate: booking.pickupDate.toLocaleDateString(),
            pickupTime: booking.pickupTime,
            pickupLocation: booking.pickupLocation.address || 'Our Branch',
            hoursUntilPickup: hoursUntilPickup,
            documentsRequired: 'Driving License, ID Proof, Credit Card for security deposit'
        };
        
        await this.sendEmail({
            email: user.email,
            subject: `Reminder: Your booking #${booking.bookingNumber} starts soon`,
            template: 'bookingReminder',
            context: context
        });
        
    } catch (error) {
        console.error('Error sending booking reminder:', error);
        throw error;
    }
};

/**
 * Send promotional email
 * @param {Object} offer - Offer object
 * @param {Array} recipients - Recipient emails
 */
exports.sendPromotionalEmail = async (offer, recipients) => {
    try {
        const context = {
            offerTitle: offer.title,
            offerDescription: offer.description,
            offerCode: offer.code,
            validUntil: offer.validUntil.toLocaleDateString(),
            terms: offer.terms ? offer.terms.join('<br>') : ''
        };
        
        await this.sendBulkEmail(recipients, {
            subject: `Special Offer: ${offer.title}`,
            template: 'promotional',
            context: context
        });
        
    } catch (error) {
        console.error('Error sending promotional email:', error);
        throw error;
    }
};