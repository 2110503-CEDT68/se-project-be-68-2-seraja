const { getCampgroundReview, createReview } = require('../../controllers/bookings');
const Booking = require('../../models/Booking'); // เปลี่ยน path ให้ตรงกับโปรเจคจริง

// Mock Model ของ Mongoose
jest.mock('../../models/Booking');

describe('Booking Controller - Reviews Section', () => {
  let req, res;

  beforeEach(() => {
    req = { params: {}, query: {}, body: {}, user: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
    console.error = jest.fn(); // ปิด console.error ไม่ให้รก terminal
  });

  describe('getCampgroundReview', () => {
    test('should get all reviews with default sort and calculate average', async () => {
      req.params.id = 'camp123';
      const mockReviews = [
        { review_rating: 5, review_comment: 'Good' },
        { review_rating: 4, review_comment: 'Nice' }
      ];

      // Mock chain: find -> populate -> sort -> exec (await)
      Booking.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockReviews)
      });

      await getCampgroundReview(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        count: 2,
        averageRating: 4.5
      }));
    });

    test('should handle custom sort and query operators (gte)', async () => {
      req.params.id = 'camp123';
      req.query = { sort: 'rating', review_rating: { gte: '4' } };
      
      Booking.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([])
      });

      await getCampgroundReview(req, res);
      
      expect(Booking.find).toHaveBeenCalledWith(expect.objectContaining({
        review_rating: { $gte: '4' }
      }));
    });

    test('should return average 0 if no reviews found', async () => {
      req.params.id = 'camp123';
      Booking.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([]) // No reviews
      });

      await getCampgroundReview(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ averageRating: 0 }));
    });

    test('should return 500 on server error', async () => {
      Booking.find.mockImplementation(() => { throw new Error('DB Error'); });
      await getCampgroundReview(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('should handle cases where some reviews have no rating (fallback to 0)', async () => {
      req.params.id = 'camp123';
      
      // จำลองว่ามี review ตัวหนึ่งที่ไม่มี rating
      const mockReviews = [
      { review_rating: 4, review_comment: 'Good' },
      { review_rating: null, review_comment: 'No rating' } // กิ่ง || 0 จะทำงานที่นี่
      ];

      Booking.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockReviews)
      });

      await getCampgroundReview(req, res);

      // คำนวณ: (4 + 0) / 2 = 2
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        count: 2,
        averageRating: 2
      }));
    });
  });

  describe('createReview', () => {
    test('should fail if user role is not "user"', async () => {
      req.user.role = 'admin';
      await createReview(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should fail if booking not found', async () => {
      req.user.role = 'user';
      req.params.id = 'b123';
      Booking.findById.mockResolvedValue(null);

      await createReview(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('should fail if user is not the owner', async () => {
      req.user = { _id: 'user1', role: 'user' };
      Booking.findById.mockResolvedValue({ user: 'user2' }); // Different ID

      await createReview(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should fail if status is "can-not-review"', async () => {
      req.user = { _id: 'user1', role: 'user' };
      Booking.findById.mockResolvedValue({ 
        user: 'user1', 
        status: 'can-not-review',
        toString: () => 'user1' 
      });

      await createReview(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should fail if status is not "checked-out"', async () => {
      req.user = { _id: 'user1', role: 'user' };
      Booking.findById.mockResolvedValue({ 
        user: 'user1', 
        status: 'pending' 
      });

      await createReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should fail if already reviewed', async () => {
      req.user = { _id: 'user1', role: 'user' };
      Booking.findById.mockResolvedValue({ 
        user: 'user1', 
        status: 'checked-out',
        review_rating: 5 // already has rating
      });

      await createReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should fail if rating is invalid', async () => {
      req.user = { _id: 'user1', role: 'user' };
      req.body = { review_rating: 6 }; // Invalid rating
      Booking.findById.mockResolvedValue({ 
        user: 'user1', 
        status: 'checked-out',
        review_rating: null
      });

      await createReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should create review successfully', async () => {
      req.user = { _id: 'u1', role: 'user' };
      req.body = { review_rating: 5, review_comment: 'Perfect' };
      const mockBooking = {
        user: 'u1',
        status: 'checked-out',
        review_rating: null,
        save: jest.fn().mockResolvedValue(true)
      };
      Booking.findById.mockResolvedValue(mockBooking);

      await createReview(req, res);

      expect(mockBooking.status).toBe('reviewed');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 on server error', async () => {
      req.user.role = 'user';
      Booking.findById.mockRejectedValue(new Error('DB Error'));
      await createReview(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('should create review with null comment if review_comment is not provided', async () => {
      req.user = { _id: 'u1', role: 'user' };
      // ส่งแค่ rating ไม่ส่ง comment
      req.body = { review_rating: 5 }; 
  
      const mockBooking = {
        user: 'u1',
        status: 'checked-out',
        review_rating: null,
        review_comment: undefined, // ค่าเริ่มต้น
        save: jest.fn().mockResolvedValue(true)
      };
      Booking.findById.mockResolvedValue(mockBooking);

      await createReview(req, res);

      // ตรวจสอบว่ามันถูกเซตเป็น null ตาม logic (review_comment || null)
      expect(mockBooking.review_comment).toBe(null); 
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});