const express = require('express');
const {
  getBookings,
  getBooking,
  addBooking,
  updateBooking,
  deleteBooking,
  exportBookings,
  checkInBooking,
  checkOutBooking
} = require('../controllers/bookings');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router
  .route('/')
  .get(protect, getBookings)

router.route('/export').get(protect, exportBookings);

router
  .route('/:id')
  .get(protect, getBooking)
  .put(protect, authorize('admin', 'user', 'campOwner'), updateBooking)
  .delete(protect, authorize('admin', 'user', 'campOwner'), deleteBooking);

router.put('/:id/checkin', protect, authorize('campOwner'), checkInBooking);
router.put('/:id/checkout', protect, authorize('campOwner'), checkOutBooking);

module.exports = router;