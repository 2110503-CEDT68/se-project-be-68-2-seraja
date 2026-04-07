const express = require('express');
const {
  getBookings,
  getBooking,
  addBooking,
  updateBooking,
  deleteBooking,
  exportBookings
} = require('../controllers/bookings');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router
  .route('/')
  .get(protect, getBookings)
  .post(protect, authorize('admin', 'user', 'campOwner'), addBooking);

router.route('/export').get(protect, exportBookings);

router
  .route('/:id')
  .get(protect, getBooking)
  .put(protect, authorize('admin', 'user', 'campOwner'), updateBooking)
  .delete(protect, authorize('admin', 'user', 'campOwner'), deleteBooking);

module.exports = router;