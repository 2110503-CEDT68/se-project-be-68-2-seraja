const Booking = require("../models/Booking");
const Campground = require("../models/Campground");

const POPULATE = [
  {
    path: "campground",
    select: "name address tel district province picture",
  },
  {
    path: "user",
    select: "name tel email",
  },
];

// ── Helper: auto-update stale bookings ────────────────────────────────────
async function autoUpdateBookingStatuses() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 1. Auto-cancel No-shows (Confirmed bookings past their check-in date)
  await Booking.updateMany(
    {
      status: "confirmed",
      checkInDate: { $lt: today },
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: now,
      },
    },
  );

  // 2. Auto-check-out (Checked-in bookings past their check-out date)
  await Booking.updateMany(
    {
      status: "checked-in",
      checkOutDate: { $lt: today },
    },
    {
      $set: {
        status: "cancelled",
        actualCheckOut: now,
      },
    },
  );
}

// ── Helper: validate & calculate nights ───────────────────────────────────
function validateDates(checkInDate, checkOutDate) {
  const newIn = new Date(checkInDate);
  const newOut = new Date(checkOutDate);
  if (isNaN(newIn) || isNaN(newOut)) return { error: "Invalid date format" };
  if (newOut <= newIn)
    return { error: "checkOutDate must be after checkInDate" };
  const nights = Math.ceil((newOut - newIn) / (24 * 60 * 60 * 1000));
  if (nights < 1) return { error: "Minimum stay is 1 night" };
  if (nights > 3) return { error: "Maximum stay is 3 nights" };
  return { newIn, newOut, nights };
}

// ── Helper: generate date range (excluding checkout date) ──────────────────
function generateDateRange(checkInDate, checkOutDate) {
  const dates = [];
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);

  // Set time to start of day for consistent comparison
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const current = new Date(start);
  while (current < end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// ── Helper: check capacity for date range ──────────────────────────────────
async function checkCapacity(
  campgroundId,
  checkInDate,
  checkOutDate,
  excludeId = null,
) {
  const campground = await Campground.findById(campgroundId);
  if (!campground) throw new Error("Campground not found");

  const dates = generateDateRange(checkInDate, checkOutDate);

  for (const date of dates) {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const query = {
      campground: campgroundId,
      status: { $in: ["confirmed", "checked-in"] },
      checkInDate: { $lt: nextDay },
      checkOutDate: { $gt: date },
    };

    if (excludeId) query._id = { $ne: excludeId };

    const count = await Booking.countDocuments(query);
    if (count >= campground.capacity) {
      return { exceeded: true, date: date.toISOString().split("T")[0] };
    }
  }

  return { exceeded: false };
}

//@desc     Get bookings
//@route    GET /api/v1/bookings
//@access   Private
exports.getBookings = async (req, res) => {
  try {
    // อัปเดตสถานะอัตโนมัติก่อนดึงข้อมูล
    await autoUpdateBookingStatuses();

    let baseQuery;

    //กำหนด scope
    if (req.user.role === "admin") {
      baseQuery = {};
    } else if (req.user.role === "campOwner") {
      const owned = await Campground.find({ owner: req.user._id }).select(
        "_id",
      );
      const ids = owned.map((c) => c._id);
      baseQuery = { campground: { $in: ids } };
    } else {
      baseQuery = { user: req.user._id };
    }

    //copy query params
    let reqQuery = { ...req.query };

    //fields ที่ไม่ใช้ filter
    const removeFields = ["select", "sort", "page", "limit"];
    removeFields.forEach((param) => delete reqQuery[param]);

    //แปลง operator เป็น Mongo
    let queryStr = JSON.stringify(reqQuery);
    queryStr = queryStr.replace(
      /\b(gte|gt|lte|lt|in)\b/g,
      (match) => `$${match}`,
    );

    const mongoQuery = JSON.parse(queryStr);

    //รวม baseQuery + filter จาก URL
    const finalQuery = {
      ...baseQuery,
      ...mongoQuery,
    };

    let query = Booking.find(finalQuery).populate(POPULATE);

    //sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(",").join(" ");
      query = query.sort(sortBy);
    } else {
      query = query.sort("checkInDate");
    }

    //select
    if (req.query.select) {
      const fields = req.query.select.split(",").join(" ");
      query = query.select(fields);
    }

    const bookings = await query;

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (err) {
    console.error("Error fetching bookings:", err.message, err);
    res.status(500).json({
      success: false,
      message: "Cannot find bookings",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

//@desc     Export bookings as CSV
//@route    GET /api/v1/bookings/export
//@access   Private (campOwner + admin)
exports.exportBookings = async (req, res) => {
  try {
    if (req.user.role === "user") {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to export bookings" });
    }

    let bookings;
    if (req.user.role === "admin") {
      bookings = await Booking.find().populate(POPULATE);
    } else {
      const owned = await Campground.find({ owner: req.user._id }).select(
        "_id",
      );
      const ids = owned.map((c) => c._id);
      bookings = await Booking.find({ campground: { $in: ids } }).populate(
        POPULATE,
      );
    }

    // Build CSV
    const headers = [
      "Booking ID",
      "Campground",
      "Guest Name",
      "Guest Tel",
      "Check-in",
      "Check-out",
      "Nights",
      "Booked On",
    ];

    const rows = bookings.map((b) => [
      b._id,
      b.campground?.name ?? "",
      b.guestName ?? "Registered User",
      b.guestTel ?? "",
      new Date(b.checkInDate).toLocaleDateString("en-GB"),
      new Date(b.checkOutDate).toLocaleDateString("en-GB"),
      b.nightsCount ?? "",
      new Date(b.createdAt).toLocaleDateString("en-GB"),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bookings-${Date.now()}.csv"`,
    );
    res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Export failed" });
  }
};

//@desc     Get single booking
//@route    GET /api/v1/bookings/:id
//@access   Private
exports.getBooking = async (req, res) => {
  try {
    // อัปเดตสถานะอัตโนมัติก่อนดึงข้อมูล
    await autoUpdateBookingStatuses();

    const booking = await Booking.findById(req.params.id).populate(POPULATE);
    if (!booking)
      return res.status(404).json({
        success: false,
        message: `No booking with id ${req.params.id}`,
      });

    const camp = await Campground.findById(booking.campground);
    const isCampOwner =
      camp && camp.owner.toString() === req.user._id.toString();
    const isOwner =
      booking.user && booking.user.toString() === req.user._id.toString();

    if (!isOwner && req.user.role !== "admin" && !isCampOwner) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to view this booking",
      });
    }

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: "Cannot find booking" });
  }
};

//@desc     Add booking (registered user OR guest via campOwner/admin)
//@route    POST /api/v1/campgrounds/:campgroundId/bookings
//@access   Private
exports.addBooking = async (req, res) => {
  try {
    // อัปเดตสถานะอัตโนมัติเพื่อให้การเช็คพื้นที่ว่างแม่นยำ
    await autoUpdateBookingStatuses();

    req.body.campground = req.params.campgroundId;
    delete req.body.nightsCount;

    const campground = await Campground.findById(req.params.campgroundId);
    if (!campground) {
      return res.status(404).json({
        success: false,
        message: `No campground with id ${req.params.campgroundId}`,
      });
    }

    const isCampOwner = campground.owner.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    // Determine booking type
    const { guestName, guestTel } = req.body;
    const isGuestBooking = guestName && guestTel;

    if (isGuestBooking) {
      // Only campOwner (of this campground) or admin can book for guests
      if (!isAdmin && !isCampOwner) {
        return res.status(403).json({
          success: false,
          message:
            "Only the campground owner or admin can create guest bookings",
        });
      }
      req.body.user = null; // no registered user
    } else {
      // Regular self-booking
      req.body.user = req.user._id;
    }

    // Validate dates
    const { checkInDate, checkOutDate } = req.body;
    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        message: "Both checkInDate and checkOutDate are required",
      });
    }

    const dateResult = validateDates(checkInDate, checkOutDate);
    if (dateResult.error)
      return res
        .status(400)
        .json({ success: false, message: dateResult.error });

    // Check capacity
    const capacityCheck = await checkCapacity(
      req.params.campgroundId,
      dateResult.newIn,
      dateResult.newOut,
    );
    if (capacityCheck.exceeded) {
      return res.status(400).json({
        success: false,
        message: `Campground is fully booked for selected dates.`,
      });
    }

    req.body.nightsCount = dateResult.nights;
    const booking = await Booking.create(req.body);

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    console.error(err);
    if (err.name === "ValidationError" || err.message?.includes("stay")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: "Cannot create booking" });
  }
};

//@desc     Update booking
//@route    PUT /api/v1/bookings/:id
//@access   Private
exports.updateBooking = async (req, res) => {
  try {
    let booking = await Booking.findById(req.params.id);
    if (!booking)
      return res.status(404).json({
        success: false,
        message: `No booking with id ${req.params.id}`,
      });

    const camp = await Campground.findById(booking.campground);
    const isCampOwner =
      camp && camp.owner.toString() === req.user._id.toString();
    const isOwner =
      booking.user && booking.user.toString() === req.user._id.toString();

    if (!isOwner && req.user.role !== "admin" && !isCampOwner) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to update this booking",
      });
    }

    // ป้องกันการแก้ไขถ้าเช็คอินไปแล้ว หรือจบการจองแล้ว หรือยกเลิกไปแล้ว
    if (["checked-in", "checked-out", "cancelled"].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update a booking that is ${booking.status}`,
      });
    }

    // Validate dates if provided
    const { checkInDate, checkOutDate } = req.body;
    if (checkInDate && checkOutDate) {
      const dateResult = validateDates(checkInDate, checkOutDate);
      if (dateResult.error)
        return res
          .status(400)
          .json({ success: false, message: dateResult.error });

      const capacityCheck = await checkCapacity(
        booking.campground,
        dateResult.newIn,
        dateResult.newOut,
        booking._id,
      );
      if (capacityCheck.exceeded) {
        return res.status(400).json({
          success: false,
          message: `Updated dates exceed campground capacity (capacity exceeded on ${capacityCheck.date})`,
        });
      }
    } else if (checkInDate || checkOutDate) {
      return res.status(400).json({
        success: false,
        message:
          "Both checkInDate and checkOutDate required when updating dates",
      });
    }

    delete req.body.nightsCount;
    Object.assign(booking, req.body);
    await booking.save();

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Cannot update booking" });
  }
};

//@desc     Delete booking
//@route    DELETE /api/v1/bookings/:id
//@access   Private
exports.deleteBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking)
      return res.status(404).json({
        success: false,
        message: `No booking with id ${req.params.id}`,
      });

    const camp = await Campground.findById(booking.campground);
    const isCampOwner =
      camp && camp.owner.toString() === req.user._id.toString();
    const isOwner =
      booking.user && booking.user.toString() === req.user._id.toString();

    if (!isOwner && req.user.role !== "admin" && !isCampOwner) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to delete this booking",
      });
    }

    // ป้องกันการลบถ้าเช็คอินไปแล้ว หรือจบการจองแล้ว หรือยกเลิกไปแล้ว (เพื่อเก็บประวัติ)
    if (["checked-in", "checked-out", "cancelled"].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete a booking that is ${booking.status}`,
      });
    }

    await booking.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, message: "Cannot delete booking" });
  }
};

//@desc     Check-in booking
//@route    PUT /api/v1/bookings/:id/checkin
//@access   Private (campOwner)
exports.checkInBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: `No booking with id ${req.params.id}`,
      });
    }

    const camp = await Campground.findById(booking.campground);

    const isCampOwner =
      camp && camp.owner.toString() === req.user._id.toString();

    // ไม่ใช่เจ้าของ camp
    if (!isCampOwner) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to check-in this booking",
      });
    }

    // ถ้าจองถูกยกเลิกไปแล้ว
    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot check-in a cancelled booking",
      });
    }

    const checkedInCount = await Booking.countDocuments({
      campground: booking.campground,
      status: "checked-in",
    });

    // ถ้าเต็มแล้ว
    if (checkedInCount >= camp.capacity) {
      return res.status(400).json({
        success: false,
        message: `This campground has reached the maximum check-in limit (${camp.capacity})`,
      });
    }

    // ถ้า check-in ไปแล้ว
    if (booking.actualCheckIn) {
      return res.status(400).json({
        success: false,
        message: "This booking is already checked in",
      });
    }

    // อนุญาตให้ Check-in เฉพาะวันที่กำหนดเท่านั้น (เปรียบเทียบเฉพาะ วัน/เดือน/ปี)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const scheduledDate = new Date(booking.checkInDate);
    scheduledDate.setHours(0, 0, 0, 0);

    if (today < scheduledDate) {
      return res.status(400).json({
        success: false,
        message: "Cannot check-in before your reservation date",
      });
    }

    if (today > scheduledDate) {
      // ถ้าเลยวันเช็คอินไปแล้ว ให้ยกเลิกการจองทันที (No-show)
      booking.status = "cancelled";
      booking.cancelledAt = new Date();
      await booking.save();
      return res.status(400).json({
        success: false,
        message:
          "The check-in date has passed. This booking has been automatically cancelled.",
      });
    }

    // ทำการ check-in
    booking.actualCheckIn = new Date();
    booking.status = "checked-in";
    await booking.save();

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Cannot check-in booking",
    });
  }
};

//@desc     Check-out booking
//@route    PUT /api/v1/bookings/:id/checkout
//@access   Private (campOwner)
exports.checkOutBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: `No booking with id ${req.params.id}`,
      });
    }

    const camp = await Campground.findById(booking.campground);

    const isCampOwner =
      camp && camp.owner.toString() === req.user._id.toString();

    // ไม่มีสิทธิ์
    if (!isCampOwner) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to check-out this booking",
      });
    }

    // ยังไม่ได้ check-in
    if (!booking.actualCheckIn) {
      return res.status(400).json({
        success: false,
        message: "Cannot check-out before check-in",
      });
    }

    // check-out ไปแล้ว
    if (booking.actualCheckOut) {
      return res.status(400).json({
        success: false,
        message: "This booking is already checked out",
      });
    }

    // ทำการ check-out
    booking.actualCheckOut = new Date();
    booking.status = "checked-out";
    await booking.save();

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Cannot check-out booking",
    });
  }
};

//@desc     Cancel booking
//@route    PUT /api/v1/bookings/:id/cancel
//@access   Private (admin, user, campOwner)
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: `No booking with id ${req.params.id}`,
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Booking is already cancelled",
      });
    }

    if (booking.status === "checked-in" || booking.status === "checked-out") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot cancel a booking that has already started or completed",
      });
    }

    const camp = await Campground.findById(booking.campground);
    const isCampOwner =
      camp && camp.owner.toString() === req.user._id.toString();
    const isOwner =
      booking.user && booking.user.toString() === req.user._id.toString();

    if (!isOwner && req.user.role !== "admin" && !isCampOwner) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this booking",
      });
    }

    booking.status = "cancelled";
    booking.cancelledAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Cannot cancel booking",
    });
  }
};

//@desc     Get today's expected check-outs
//@route    GET /api/v1/bookings/today-checkouts
//@access   Private (campOwner, admin)
exports.getTodayCheckouts = async (req, res) => {
  try {
    if (req.user.role === "user") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this resource",
      });
    }

    // สร้าง date range สำหรับวันนี้ (00:00:00 ถึง 23:59:59)
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );

    let query;

    if (req.user.role === "admin") {
      // admin เห็นทุก campground
      query = {
        checkOutDate: { $gte: startOfToday, $lte: endOfToday },
        status: "checked-in",
      };
    } else {
      // campOwner เห็นเฉพาะ campground ของตัวเอง
      const ownedCampgrounds = await Campground.find({
        owner: req.user._id,
      }).select("_id");
      const campgroundIds = ownedCampgrounds.map((c) => c._id);

      query = {
        campground: { $in: campgroundIds },
        checkOutDate: { $gte: startOfToday, $lte: endOfToday },
        status: "checked-in",
      };
    }

    const bookings = await Booking.find(query).populate(POPULATE);

    res.status(200).json({
      success: true,
      count: bookings.length,
      date: now.toISOString().split("T")[0],
      data: bookings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Cannot fetch today checkouts",
    });
  }
};

//@desc     Get campground reviews
//@route    GET /api/v1/bookings/review
//@access   Private (campOwner)
exports.getCampgroundReview = async (req, res) => {
  try {
    if (req.user.role !== "campOwner") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access campground reviews",
      });
    }

    // หา campground ของ owner
    const ownedCampgrounds = await Campground.find({
      owner: req.user._id,
    }).select("_id");

    const campgroundIds = ownedCampgrounds.map((c) => c._id);

    // base query
    let query = Booking.find({
      campground: { $in: campgroundIds },
      review_rating: { $ne: null },
    }).populate([
      {
        path: "campground",
        select: "name province district",
      },
      {
        path: "user",
        select: "name email",
      },
    ]);

    //เพิ่ม sort จาก query
    if (req.query.sort) {
      const sortBy = req.query.sort.split(",").join(" ");
      query = query.sort(sortBy);
    } else {
      // default sort
      query = query.sort("-review_createdAt");
    }

    const reviews = await query;

    // average rating
    const avg =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + (r.review_rating || 0), 0) /
          reviews.length
        : 0;

    res.status(200).json({
      success: true,
      count: reviews.length,
      averageRating: Number(avg.toFixed(2)),
      data: reviews,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Cannot fetch campground reviews",
    });
  }
};

//@desc     create review booking
//@route    Put /api/v1/bookings/createReview
//@access   Private (User)
exports.createReview = async (req, res) => {
  //ให้ user ที่มีstatus check out เพิ่ม review เข้า booking เเล้วเปลี่ยน status เป็น reviewed
  //(ที่ใช่เป็นput เพราะเรามีตัวbooking อยู่เเล้ว)
}

//@desc     update review booking
//@route    Put /api/v1/bookings/updateReview
//@access   Private (User)
exports.updateReview = async (req, res) => {
  //ให้ user update review
}

//@desc     delete review booking
//@route    Put /api/v1/bookings/review
//@access   Private (User)
exports.deleteReview = async (req, res) => {
  //user ลบ review จะเอา review กลับไปเป็น null status กลับเป็น check-out เเต่ถ้าเป็นadmin ลบ review กลับไปเป็นnull status เป็น can-not-review
}