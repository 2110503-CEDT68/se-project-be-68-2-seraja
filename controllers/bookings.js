const Booking = require('../models/Booking');
const Campground = require('../models/Campground');

const POPULATE = {
    path: 'campground',
    select: 'name address tel district province picture'
};

// ── Helper: validate & calculate nights ───────────────────────────────────
function validateDates(checkInDate, checkOutDate) {
    const newIn  = new Date(checkInDate);
    const newOut = new Date(checkOutDate);
    if (isNaN(newIn) || isNaN(newOut))   return { error: 'Invalid date format' };
    if (newOut <= newIn)                  return { error: 'checkOutDate must be after checkInDate' };
    const nights = Math.ceil((newOut - newIn) / (24 * 60 * 60 * 1000));
    if (nights < 1) return { error: 'Minimum stay is 1 night' };
    if (nights > 3) return { error: 'Maximum stay is 3 nights' };
    return { newIn, newOut, nights };
}

// ── Helper: check date overlap ────────────────────────────────────────────
async function checkOverlap(campgroundId, newIn, newOut, excludeId = null) {
    const query = {
        campground: campgroundId,
        checkInDate:  { $lt: newOut },
        checkOutDate: { $gt: newIn  }
    };
    if (excludeId) query._id = { $ne: excludeId };
    return await Booking.findOne(query);
}

//@desc     Get bookings
//@route    GET /api/v1/bookings
//@access   Private
exports.getBookings = async (req, res) => {
    try {
        let query;

        if (req.user.role === 'admin') {
            // Admin sees ALL bookings
            query = Booking.find().populate(POPULATE);

        } else if (req.user.role === 'campOwner') {
            // CampOwner sees bookings for their own campgrounds
            const owned = await Campground.find({ owner: req.user.id }).select('_id');
            const ids   = owned.map(c => c._id);
            query = Booking.find({ campground: { $in: ids } }).populate(POPULATE);

        } else {
            // Regular user sees only their own bookings
            query = Booking.find({ user: req.user.id }).populate(POPULATE);
        }

        const bookings = await query.sort({ checkInDate: 1 });

        res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Cannot find bookings' });
    }
};

//@desc     Export bookings as CSV
//@route    GET /api/v1/bookings/export
//@access   Private (campOwner + admin)
exports.exportBookings = async (req, res) => {
    try {
        if (req.user.role === 'user') {
            return res.status(403).json({ success: false, message: 'Not authorized to export bookings' });
        }

        let bookings;
        if (req.user.role === 'admin') {
            bookings = await Booking.find().populate(POPULATE);
        } else {
            const owned = await Campground.find({ owner: req.user.id }).select('_id');
            const ids   = owned.map(c => c._id);
            bookings = await Booking.find({ campground: { $in: ids } }).populate(POPULATE);
        }

        // Build CSV
        const headers = [
            'Booking ID', 'Campground', 'Guest Name', 'Guest Tel',
            'Check-in', 'Check-out', 'Nights', 'Booked On'
        ];

        const rows = bookings.map(b => [
            b._id,
            b.campground?.name ?? '',
            b.guestName ?? 'Registered User',
            b.guestTel  ?? '',
            new Date(b.checkInDate).toLocaleDateString('en-GB'),
            new Date(b.checkOutDate).toLocaleDateString('en-GB'),
            b.nightsCount ?? '',
            new Date(b.createdAt).toLocaleDateString('en-GB')
        ]);

        const csv = [headers, ...rows]
            .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="bookings-${Date.now()}.csv"`);
        res.status(200).send(csv);

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Export failed' });
    }
};

//@desc     Get single booking
//@route    GET /api/v1/bookings/:id
//@access   Private
exports.getBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate(POPULATE);
        if (!booking) return res.status(404).json({ success: false, message: `No booking with id ${req.params.id}` });

        const camp       = await Campground.findById(booking.campground);
        const isCampOwner = camp && camp.owner.toString() === req.user.id;
        const isOwner     = booking.user && booking.user.toString() === req.user.id;

        if (!isOwner && req.user.role !== 'admin' && !isCampOwner) {
            return res.status(401).json({ success: false, message: 'Not authorized to view this booking' });
        }

        res.status(200).json({ success: true, data: booking });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Cannot find booking' });
    }
};

//@desc     Add booking (registered user OR guest via campOwner/admin)
//@route    POST /api/v1/campgrounds/:campgroundId/bookings
//@access   Private
exports.addBooking = async (req, res) => {
    try {
        req.body.campground = req.params.campgroundId;
        delete req.body.nightsCount;

        const campground = await Campground.findById(req.params.campgroundId);
        if (!campground) {
            return res.status(404).json({ success: false, message: `No campground with id ${req.params.campgroundId}` });
        }

        const isCampOwner = campground.owner.toString() === req.user.id;
        const isAdmin     = req.user.role === 'admin';

        // Determine booking type
        const { guestName, guestTel } = req.body;
        const isGuestBooking = guestName && guestTel;

        if (isGuestBooking) {
            // Only campOwner (of this campground) or admin can book for guests
            if (!isAdmin && !isCampOwner) {
                return res.status(403).json({ success: false, message: 'Only the campground owner or admin can create guest bookings' });
            }
            req.body.user = null; // no registered user
        } else {
            // Regular self-booking
            req.body.user = req.user.id;
        }

        // Validate dates
        const { checkInDate, checkOutDate } = req.body;
        if (!checkInDate || !checkOutDate) {
            return res.status(400).json({ success: false, message: 'Both checkInDate and checkOutDate are required' });
        }

        const dateResult = validateDates(checkInDate, checkOutDate);
        if (dateResult.error) return res.status(400).json({ success: false, message: dateResult.error });

        // Check overlap
        const overlap = await checkOverlap(req.params.campgroundId, dateResult.newIn, dateResult.newOut);
        if (overlap) return res.status(400).json({ success: false, message: 'These dates overlap an existing booking' });

        req.body.nightsCount = dateResult.nights;
        const booking = await Booking.create(req.body);

        res.status(201).json({ success: true, data: booking });
    } catch (err) {
        console.error(err);
        if (err.name === 'ValidationError' || err.message?.includes('stay')) {
            return res.status(400).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: 'Cannot create booking' });
    }
};

//@desc     Update booking
//@route    PUT /api/v1/bookings/:id
//@access   Private
exports.updateBooking = async (req, res) => {
    try {
        let booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: `No booking with id ${req.params.id}` });

        const camp        = await Campground.findById(booking.campground);
        const isCampOwner = camp && camp.owner.toString() === req.user.id;
        const isOwner     = booking.user && booking.user.toString() === req.user.id;

        if (!isOwner && req.user.role !== 'admin' && !isCampOwner) {
            return res.status(401).json({ success: false, message: 'Not authorized to update this booking' });
        }

        // Validate dates if provided
        const { checkInDate, checkOutDate } = req.body;
        if (checkInDate && checkOutDate) {
            const dateResult = validateDates(checkInDate, checkOutDate);
            if (dateResult.error) return res.status(400).json({ success: false, message: dateResult.error });

            const overlap = await checkOverlap(booking.campground, dateResult.newIn, dateResult.newOut, booking._id);
            if (overlap) return res.status(400).json({ success: false, message: 'Updated dates overlap an existing booking' });
        } else if (checkInDate || checkOutDate) {
            return res.status(400).json({ success: false, message: 'Both checkInDate and checkOutDate required when updating dates' });
        }

        delete req.body.nightsCount;
        Object.assign(booking, req.body);
        await booking.save();

        res.status(200).json({ success: true, data: booking });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Cannot update booking' });
    }
};

//@desc     Delete booking
//@route    DELETE /api/v1/bookings/:id
//@access   Private
exports.deleteBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: `No booking with id ${req.params.id}` });

        const camp        = await Campground.findById(booking.campground);
        const isCampOwner = camp && camp.owner.toString() === req.user.id;
        const isOwner     = booking.user && booking.user.toString() === req.user.id;

        if (!isOwner && req.user.role !== 'admin' && !isCampOwner) {
            return res.status(401).json({ success: false, message: 'Not authorized to delete this booking' });
        }

        await booking.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Cannot delete booking' });
    }
};