const express = require("express");
const {
  getBookings,
  getBooking,
  addBooking,
  updateBooking,
  deleteBooking,
  exportBookings,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  getTodayCheckouts,
  getCampgroundReview,
  createReview
} = require("../controllers/bookings");

const { protect, authorize } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

router
  .route("/")
  .get(protect, getBookings)
  .post(protect, authorize("admin", "user", "campOwner"), addBooking);


router.route("/export").get(protect, exportBookings);
router
  .route("/today-checkouts")
  .get(protect, authorize("admin", "campOwner"), getTodayCheckouts);

router
  .route("/:id")
  .get(protect, getBooking)
  .put(protect, authorize("admin", "user", "campOwner"), updateBooking)
  .delete(protect, authorize("admin", "user", "campOwner"), deleteBooking);

router.put(
  "/:id/cancel",
  protect,
  authorize("admin", "user", "campOwner"),
  cancelBooking,
);
router.put("/:id/checkin", protect, authorize("campOwner"), checkInBooking);
router.put("/:id/checkout", protect, authorize("campOwner"), checkOutBooking);
router.put("/:id/review",protect,authorize("user"),createReview)
router.get("/:id/review",protect,authorize("admin", "user", "campOwner"),getCampgroundReview)
module.exports = router;