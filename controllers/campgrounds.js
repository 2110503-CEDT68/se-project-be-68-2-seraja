const Campground = require("../models/Campground");
const Booking = require("../models/Booking");

//@desc     Get all campgrounds
//@route    GET /api/v1/campgrounds
//@access   Public
exports.getCampgrounds = async (req, res, next) => {
  try {
    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ["select", "sort", "page", "limit"];

    removeFields.forEach((param) => delete reqQuery[param]);

    // Advanced filtering
    let queryStr = JSON.stringify(reqQuery);

    queryStr = queryStr.replace(
      /\b(gt|gte|lt|lte|in)\b/g,
      (match) => `$${match}`,
    );

    let query = Campground.find(JSON.parse(queryStr));

    // Select
    if (req.query.select) {
      const fields = req.query.select.split(",").join(" ");
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(",").join(" ");
      query = query.sort(sortBy);
    } else {
      query = query.sort("name");
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;

    query = query.skip(startIndex).limit(limit);

    const campgrounds = await query;

    res.status(200).json({
      success: true,
      count: campgrounds.length,
      data: campgrounds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

//@desc     Get single campground
//@route    GET /api/v1/campgrounds/:id
//@access   Public
exports.getCampground = async (req, res, next) => {
  try {
    const campground = await Campground.findById(req.params.id);

    if (!campground) {
      return res.status(404).json({ success: false, message: "Campground not found" });
    }

    res.status(200).json({ success: true, data: campground });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

//@desc     Create new campground
//@route    POST /api/v1/campgrounds
//@access   Private (Admin only)
exports.createCampground = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(401).json({
        success: false,
        message: "Only administrators can create campgrounds",
      });
    }

    const campground = await Campground.create(req.body);
    res.status(201).json({ success: true, data: campground });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

//@desc     Update campground (admin or owner only)
//@route    PUT /api/v1/campgrounds/:id
//@access   Private (Admin or campOwner)
exports.updateCampground = async (req, res, next) => {
  try {
    let campground = await Campground.findById(req.params.id);

    if (!campground) {
      return res.status(404).json({ success: false, message: "Campground not found" });
    }

    if (
      req.user.role !== "admin" &&
      campground.owner.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this campground",
      });
    }

    // prevent campOwner from reassigning ownership
    if (req.user.role !== "admin") {
      delete req.body.owner;
    }

    campground = await Campground.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, data: campground });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

//@desc     Delete campground (admin only)
//@route    DELETE /api/v1/campgrounds/:id
//@access   Private (Admin only)
exports.deleteCampground = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(401).json({
        success: false,
        message: "Only administrators can delete campgrounds",
      });
    }

    const campground = await Campground.findById(req.params.id);

    if (!campground) {
      return res.status(404).json({ success: false, message: "Campground not found" });
    }

    // Delete all bookings associated with this campground
    await Booking.deleteMany({ campground: req.params.id });
    await Campground.deleteOne({ _id: req.params.id });

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    console.error("Delete Campground Error:", err);
    res.status(500).json({ success: false });
  }
};
