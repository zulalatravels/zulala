const User = require('../models/User');
const Referral = require('../models/Referral');
const Notification = require('../models/Notification');

exports.processReferral = async (referrerId, referredUserId) => {
    try {
        const referrer = await User.findById(referrerId);
        const referredUser = await User.findById(referredUserId);

        if (!referrer || !referredUser) {
            throw new Error('Invalid users');
        }

        // Update referrer's wallet
        referrer.walletBalance += 100;
        referrer.referralPoints += 100;
        await referrer.save();

        // Update referral record
        await Referral.findOneAndUpdate(
            { referrer: referrerId, referredUser: referredUserId },
            { status: 'completed', completedAt: new Date() }
        );

        // Send notification
        await Notification.create({
            user: referrerId,
            title: 'Referral Reward!',
            message: `You earned ₹100 for referring ${referredUser.name}`,
            type: 'referral'
        });

        return true;
    } catch (error) {
        console.error('Error processing referral:', error);
        return false;
    }
};

exports.getReferralStats = async (userId) => {
    try {
        const referrals = await Referral.find({ referrer: userId })
            .populate('referredUser', 'name email createdAt');

        const completed = referrals.filter(r => r.status === 'completed').length;
        const pending = referrals.filter(r => r.status === 'pending').length;
        const totalEarned = completed * 100;

        return {
            totalReferrals: referrals.length,
            completed,
            pending,
            totalEarned,
            referrals
        };
    } catch (error) {
        console.error('Error getting referral stats:', error);
        return null;
    }
};