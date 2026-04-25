const mongoose = require('mongoose');
const Campground = require('./Campground');

const BookingSchema = new mongoose.Schema({
    // ── Dates ──────────────────────────────────────────────
    checkInDate: {
        type: Date,
        required: [true, 'Please provide check-in date']
    },
    checkOutDate: { 
        type: Date,
        required: [true, 'Please provide check-out date']
    },
    actualCheckIn: {
        type: Date
    },
    actualCheckOut: {
        type: Date
    },
    nightsCount: {
        type: Number,
        min: [1, 'Minimum nights is 1'],
        max: [3, 'Maximum nights is 3']
    },

    // ── Registered user (optional if guest booking) ────────
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        default: null
    },

    // ── Guest info (for campOwner walk-in bookings) ────────
    guestName: {
        type: String,
        default: null,
        trim: true
    },
    guestTel: {
        type: String,
        default: null,
        trim: true
    },

    // ── Campground ─────────────────────────────────────────
    campground: {
        type: mongoose.Schema.ObjectId,
        ref: 'Campground',
        required: true
    },
    // ── Status ─────────────────────────────────────────
    status: {
        type: String,
        enum: ['confirmed', 'checked-in', 'checked-out', 'cancelled','reviewed','can-not-review'],
        default: 'confirmed'
    },
    cancelledAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    review_rating: {
        type: Number,
        default: null
    },
    review_comment: {
        type: String,
        default: null
    },
    review_createdAt: {
        type: Date,
    },
    review_isDeleted: {
        type: Boolean,
        default: false
    }
});

// Validate: must have either a registered user OR guest info
BookingSchema.pre('save', async function () {
    if (!this.user && (!this.guestName || !this.guestTel)) {
        throw new Error('Booking must have either a registered user or guest name + telephone');
    }

    if (this.isModified('checkInDate') || this.isModified('checkOutDate')) {
        if (!this.checkInDate || !this.checkOutDate) {
            throw new Error('Both check-in and check-out dates are required');
        }
        if (this.checkOutDate <= this.checkInDate) {
            throw new Error('checkOutDate must be later than checkInDate');
        }

        const msPerDay = 24 * 60 * 60 * 1000;
        const diff = Math.ceil((this.checkOutDate - this.checkInDate) / msPerDay);
        this.nightsCount = diff;

        if (this.nightsCount < 1) throw new Error('Minimum stay is 1 night');
        if (this.nightsCount > 3) throw new Error('Maximum stay is 3 nights');
    }
});

BookingSchema.statics.calculateAverageRating = async function (campgroundId) {
    const result = await this.aggregate([
        {
            $match: {
                campground: campgroundId,
                review_rating: { $ne: null },
                review_isDeleted: false
            }
        },
        {
            $group: {
                _id: '$campground',
                avgRating: { $avg: '$review_rating' },
                count: { $sum: 1 }
            }
        }
    ]);

    try {
        await mongoose.model('Campground').findByIdAndUpdate(campgroundId, {
            averageRating: result[0]?.avgRating || null,
            ratingsCount: result[0]?.count || 0
        });
    } catch (err) {
        console.error(err);
    }
};

BookingSchema.post('save', function () {
    this.constructor.calculateAverageRating(this.campground);
});

BookingSchema.post('findOneAndUpdate', async function (doc) {
    if (doc) {
        await doc.constructor.calculateAverageRating(doc.campground);
    }
});

BookingSchema.post('findOneAndDelete', async function (doc) {
    if (doc) {
        await doc.constructor.calculateAverageRating(doc.campground);
    }
});

module.exports = mongoose.model('Booking', BookingSchema);