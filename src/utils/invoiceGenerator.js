const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { cloudinary } = require('../config/cloudinary');

/**
 * Generate invoice PDF
 * @param {Object} invoiceData - Invoice data
 * @param {boolean} isFinal - Is final invoice (after return)
 * @returns {Promise<string>} - Cloudinary URL of the invoice
 */
exports.generateInvoice = async (invoiceData, isFinal = false) => {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];
            
            // Collect PDF chunks
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', async () => {
                try {
                    const pdfBuffer = Buffer.concat(chunks);
                    
                    // Upload to Cloudinary
                    const result = await new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'car-rental/invoices',
                                resource_type: 'raw',
                                public_id: `invoice_${invoiceData.bookingNumber}_${Date.now()}`,
                                format: 'pdf'
                            },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        );
                        
                        stream.end(pdfBuffer);
                    });
                    
                    resolve(result.secure_url);
                } catch (error) {
                    reject(error);
                }
            });
            
            // Generate invoice content
            generateInvoiceContent(doc, invoiceData, isFinal);
            doc.end();
            
        } catch (error) {
            reject(error);
        }
    });
};

/**
 * Generate invoice content
 * @param {PDFDocument} doc - PDF document
 * @param {Object} data - Invoice data
 * @param {boolean} isFinal - Is final invoice
 */
function generateInvoiceContent(doc, data, isFinal) {
    const { 
        bookingNumber, 
        userName, 
        userEmail,
        carDetails,
        pickupDate,
        dropoffDate,
        totalDays,
        baseAmount,
        additionalCharges = [],
        discountAmount = 0,
        taxAmount = 0,
        securityDeposit,
        totalAmount,
        extraCharges
    } = data;
    
    // Header
    doc.fontSize(25).text('Car Rental Service', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text('123 Rental Street, Mumbai, India', { align: 'center' });
    doc.text('Phone: +91 9876543210 | Email: info@carrental.com', { align: 'center' });
    doc.moveDown();
    
    // Invoice Title
    doc.fontSize(20).text(isFinal ? 'FINAL INVOICE' : 'PROFORMA INVOICE', { align: 'center' });
    doc.moveDown();
    
    // Invoice Details
    doc.fontSize(12);
    doc.text(`Invoice Number: INV-${bookingNumber}`);
    doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Booking Number: ${bookingNumber}`);
    doc.moveDown();
    
    // Customer Details
    doc.fontSize(14).text('Customer Details:', { underline: true });
    doc.fontSize(12);
    doc.text(`Name: ${userName}`);
    doc.text(`Email: ${userEmail}`);
    doc.moveDown();
    
    // Booking Details
    doc.fontSize(14).text('Booking Details:', { underline: true });
    doc.fontSize(12);
    doc.text(`Car: ${carDetails}`);
    doc.text(`Pickup Date: ${new Date(pickupDate).toLocaleDateString()}`);
    doc.text(`Dropoff Date: ${new Date(dropoffDate).toLocaleDateString()}`);
    doc.text(`Total Days: ${totalDays}`);
    doc.moveDown();
    
    // Charges Table
    const tableTop = doc.y + 10;
    const itemX = 50;
    const descriptionX = 150;
    const amountX = 450;
    
    // Table Header
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Item', itemX, tableTop);
    doc.text('Description', descriptionX, tableTop);
    doc.text('Amount (₹)', amountX, tableTop);
    
    // Horizontal Line
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    let y = tableTop + 30;
    doc.font('Helvetica');
    
    // Base Amount
    doc.text('1', itemX, y);
    doc.text('Car Rental Charges', descriptionX, y);
    doc.text(baseAmount.toFixed(2), amountX, y);
    y += 20;
    
    // Additional Services
    let itemCount = 2;
    additionalCharges.forEach((charge, index) => {
        if (charge.type !== 'discount' && charge.type !== 'tax') {
            doc.text(itemCount.toString(), itemX, y);
            doc.text(charge.description || 'Additional Service', descriptionX, y);
            doc.text(charge.amount.toFixed(2), amountX, y);
            y += 20;
            itemCount++;
        }
    });
    
    // Discounts
    if (discountAmount > 0) {
        doc.text(itemCount.toString(), itemX, y);
        doc.text('Discount', descriptionX, y);
        doc.text(`-${discountAmount.toFixed(2)}`, amountX, y);
        y += 20;
        itemCount++;
    }
    
    // Taxes
    if (taxAmount > 0) {
        doc.text(itemCount.toString(), itemX, y);
        doc.text('GST (18%)', descriptionX, y);
        doc.text(taxAmount.toFixed(2), amountX, y);
        y += 20;
        itemCount++;
    }
    
    // Extra Charges (for final invoice)
    if (isFinal && extraCharges) {
        if (extraCharges.extraKilometers) {
            doc.text(itemCount.toString(), itemX, y);
            doc.text('Extra Kilometers', descriptionX, y);
            doc.text(extraCharges.extraKilometers.toFixed(2), amountX, y);
            y += 20;
            itemCount++;
        }
        
        if (extraCharges.fuelCharges) {
            doc.text(itemCount.toString(), itemX, y);
            doc.text('Fuel Refill Charges', descriptionX, y);
            doc.text(extraCharges.fuelCharges.toFixed(2), amountX, y);
            y += 20;
            itemCount++;
        }
        
        if (extraCharges.damages && extraCharges.damages.length > 0) {
            extraCharges.damages.forEach(damage => {
                if (damage.repairCost) {
                    doc.text(itemCount.toString(), itemX, y);
                    doc.text(`Damage: ${damage.description}`, descriptionX, y);
                    doc.text(damage.repairCost.toFixed(2), amountX, y);
                    y += 20;
                    itemCount++;
                }
            });
        }
    }
    
    // Security Deposit (separate line)
    y += 10;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 20;
    
    doc.text('Security Deposit', descriptionX, y);
    doc.text(securityDeposit.toFixed(2), amountX, y);
    y += 30;
    
    // Total
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 20;
    
    doc.font('Helvetica-Bold').fontSize(14);
    doc.text('TOTAL AMOUNT', descriptionX, y);
    doc.text(totalAmount.toFixed(2), amountX, y);
    
    // Payment Instructions
    y += 40;
    doc.font('Helvetica').fontSize(10);
    doc.text('Payment Instructions:', 50, y, { underline: true });
    y += 15;
    doc.text('• Payment can be made via Credit Card, Debit Card, Net Banking, or UPI', 50, y);
    y += 15;
    doc.text('• Security deposit will be refunded after car return and inspection', 50, y);
    y += 15;
    doc.text('• For queries, contact: support@carrental.com | +91 9876543210', 50, y);
    
    // Terms and Conditions
    y += 40;
    doc.fontSize(12).text('Terms and Conditions:', { underline: true });
    doc.fontSize(10);
    doc.text('1. Cancellation within 24 hours of pickup: 50% cancellation fee', 50, y + 15);
    doc.text('2. Cancellation 24-48 hours before pickup: 25% cancellation fee', 50, y + 30);
    doc.text('3. Cancellation more than 48 hours before pickup: 10% cancellation fee', 50, y + 45);
    doc.text('4. Fuel policy: Full-to-full', 50, y + 60);
    doc.text('5. Free kilometers: 300 km per day, additional ₹10/km', 50, y + 75);
    doc.text('6. Late return: ₹500 per hour after grace period of 1 hour', 50, y + 90);
    
    // Footer
    const pageHeight = doc.page.height;
    doc.fontSize(8).text(
        'This is a computer-generated invoice. No signature required.',
        50,
        pageHeight - 50,
        { align: 'center' }
    );
}

/**
 * Generate booking summary (simpler version)
 * @param {Object} booking - Booking object
 * @returns {Promise<string>} - PDF URL
 */
exports.generateBookingSummary = async (booking) => {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];
            
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', async () => {
                try {
                    const pdfBuffer = Buffer.concat(chunks);
                    
                    const result = await new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'car-rental/summaries',
                                resource_type: 'raw',
                                public_id: `summary_${booking.bookingNumber}`,
                                format: 'pdf'
                            },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        );
                        
                        stream.end(pdfBuffer);
                    });
                    
                    resolve(result.secure_url);
                } catch (error) {
                    reject(error);
                }
            });
            
            // Simple booking summary
            doc.fontSize(20).text('Booking Summary', { align: 'center' });
            doc.moveDown();
            
            doc.fontSize(12);
            doc.text(`Booking ID: ${booking.bookingNumber}`);
            doc.text(`Status: ${booking.status}`);
            doc.text(`Total Amount: ₹${booking.totalAmount}`);
            doc.text(`Payment Status: ${booking.payment.status}`);
            doc.moveDown();
            
            doc.text('Thank you for choosing Car Rental Service!');
            
            doc.end();
            
        } catch (error) {
            reject(error);
        }
    });
};

/**
 * Generate daily report
 * @param {Array} bookings - Today's bookings
 * @param {Object} stats - Daily statistics
 * @returns {Promise<string>} - PDF URL
 */
exports.generateDailyReport = async (bookings, stats) => {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];
            
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', async () => {
                try {
                    const pdfBuffer = Buffer.concat(chunks);
                    
                    const result = await new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'car-rental/reports',
                                resource_type: 'raw',
                                public_id: `daily_report_${new Date().toISOString().split('T')[0]}`,
                                format: 'pdf'
                            },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        );
                        
                        stream.end(pdfBuffer);
                    });
                    
                    resolve(result.secure_url);
                } catch (error) {
                    reject(error);
                }
            });
            
            const today = new Date().toLocaleDateString();
            
            doc.fontSize(20).text('Daily Report', { align: 'center' });
            doc.fontSize(12).text(today, { align: 'center' });
            doc.moveDown();
            
            // Statistics
            doc.fontSize(14).text('Daily Statistics:', { underline: true });
            doc.fontSize(12);
            doc.text(`Total Bookings: ${stats.totalBookings}`);
            doc.text(`New Bookings: ${stats.newBookings}`);
            doc.text(`Completed Bookings: ${stats.completedBookings}`);
            doc.text(`Total Revenue: ₹${stats.totalRevenue}`);
            doc.text(`Average Booking Value: ₹${stats.avgBookingValue}`);
            doc.moveDown();
            
            // Bookings List
            if (bookings.length > 0) {
                doc.fontSize(14).text('Today\'s Bookings:', { underline: true });
                doc.moveDown();
                
                bookings.forEach((booking, index) => {
                    doc.text(`${index + 1}. ${booking.bookingNumber} - ${booking.carDetails} - ₹${booking.totalAmount} - ${booking.status}`);
                });
            }
            
            doc.end();
            
        } catch (error) {
            reject(error);
        }
    });
};