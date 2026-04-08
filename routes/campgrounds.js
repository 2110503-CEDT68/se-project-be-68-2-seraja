const express = require('express');
const {
  getCampgrounds,
  getCampground,
  createCampground,
  updateCampground,
  deleteCampground
} = require('../controllers/campgrounds');
const {
 addBooking
} = require('../controllers/bookings')

const { protect, authorize } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router
  .route('/')
  .get(getCampgrounds)
  .post(protect, authorize('admin'), createCampground);

router
  .route('/:id')
  .get(getCampground)
  .put(protect, authorize('admin','campOwner'), updateCampground)
  .delete(protect, authorize('admin'), deleteCampground);

router.route('/:campgroundId/bookings').post(protect, authorize('admin', 'user', 'campOwner'), addBooking);
module.exports = router;