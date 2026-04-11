const express = require("express");
const {
  getCampgrounds,
  getCampground,
  createCampground,
  updateCampground,
  deleteCampground,
} = require("../controllers/campgrounds");
const bookingRouter = require("./bookings");

const { protect, authorize } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

router
  .route("/")
  .get(getCampgrounds)
  .post(protect, authorize("admin"), createCampground);

router
  .route("/:id")
  .get(getCampground)
  .put(protect, authorize("admin", "campOwner"), updateCampground)
  .delete(protect, authorize("admin"), deleteCampground);

router.use("/:campgroundId/bookings", bookingRouter);

module.exports = router;
