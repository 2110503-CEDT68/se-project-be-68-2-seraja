jest.mock("../../models/Campground", () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
}));

jest.mock("../../models/Booking", () => ({
  deleteMany: jest.fn(),
}));

const Campground = require("../../models/Campground");
const Booking = require("../../models/Booking");
const campgroundsController = require("../../controllers/campgrounds");

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function createThenableQuery({ result, error }) {
  const query = {
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: (onFulfilled, onRejected) => {
      if (error) {
        return Promise.reject(error).then(onFulfilled, onRejected);
      }
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

describe("campgrounds controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getCampgrounds", () => {
    it("returns filtered campgrounds with select, sort and pagination", async () => {
      const req = {
        query: {
          price: { gte: "100" },
          select: "name,address",
          sort: "price,-name",
          page: "2",
          limit: "10",
        },
      };
      const res = createRes();
      const next = jest.fn();
      const data = [{ name: "A" }, { name: "B" }];
      const query = createThenableQuery({ result: data });

      Campground.find.mockReturnValue(query);

      await campgroundsController.getCampgrounds(req, res, next);

      expect(Campground.find).toHaveBeenCalledWith({ price: { $gte: "100" } });
      expect(query.select).toHaveBeenCalledWith("name address");
      expect(query.sort).toHaveBeenCalledWith("price -name");
      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.limit).toHaveBeenCalledWith(10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data,
      });
    });

    it("uses default sort and pagination values when query is empty", async () => {
      const req = { query: {} };
      const res = createRes();
      const next = jest.fn();
      const data = [{ name: "Default" }];
      const query = createThenableQuery({ result: data });

      Campground.find.mockReturnValue(query);

      await campgroundsController.getCampgrounds(req, res, next);

      expect(query.sort).toHaveBeenCalledWith("name");
      expect(query.skip).toHaveBeenCalledWith(0);
      expect(query.limit).toHaveBeenCalledWith(25);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        data,
      });
    });

    it("returns 500 when querying campgrounds fails", async () => {
      const req = { query: {} };
      const res = createRes();
      const next = jest.fn();
      const err = new Error("query failed");
      const query = createThenableQuery({ error: err });
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      Campground.find.mockReturnValue(query);

      await campgroundsController.getCampgrounds(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith(err);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false });

      consoleSpy.mockRestore();
    });
  });

  describe("getCampground", () => {
    it("returns a single campground", async () => {
      const req = { params: { id: "1" } };
      const res = createRes();
      const next = jest.fn();
      const campground = { _id: "1", name: "Test" };

      Campground.findById.mockResolvedValue(campground);

      await campgroundsController.getCampground(req, res, next);

      expect(Campground.findById).toHaveBeenCalledWith("1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: campground,
      });
    });

    it("returns 404 when campground is not found", async () => {
      const req = { params: { id: "404" } };
      const res = createRes();
      const next = jest.fn();

      Campground.findById.mockResolvedValue(null);

      await campgroundsController.getCampground(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Campground not found",
      });
    });

    it("returns 500 on database error", async () => {
      const req = { params: { id: "bad" } };
      const res = createRes();
      const next = jest.fn();

      Campground.findById.mockRejectedValue(new Error("db error"));

      await campgroundsController.getCampground(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  describe("createCampground", () => {
    it("returns 401 for non-admin users", async () => {
      const req = { user: { role: "user" }, body: { name: "X" } };
      const res = createRes();
      const next = jest.fn();

      await campgroundsController.createCampground(req, res, next);

      expect(Campground.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Only administrators can create campgrounds",
      });
    });

    it("creates campground for admin users", async () => {
      const req = {
        user: { role: "admin" },
        body: { name: "New Camp" },
      };
      const res = createRes();
      const next = jest.fn();
      const created = { _id: "2", name: "New Camp" };

      Campground.create.mockResolvedValue(created);

      await campgroundsController.createCampground(req, res, next);

      expect(Campground.create).toHaveBeenCalledWith({ name: "New Camp" });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: created });
    });

    it("returns 500 when create fails", async () => {
      const req = { user: { role: "admin" }, body: { name: "Bad Camp" } };
      const res = createRes();
      const next = jest.fn();
      const err = new Error("create failed");
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      Campground.create.mockRejectedValue(err);

      await campgroundsController.createCampground(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith(err);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false });

      consoleSpy.mockRestore();
    });
  });

  describe("updateCampground", () => {
    it("returns 404 when campground does not exist", async () => {
      const req = {
        params: { id: "10" },
        user: { role: "admin", _id: "admin-id" },
        body: { name: "Update" },
      };
      const res = createRes();
      const next = jest.fn();

      Campground.findById.mockResolvedValue(null);

      await campgroundsController.updateCampground(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Campground not found",
      });
    });

    it("returns 403 when user is neither admin nor owner", async () => {
      const req = {
        params: { id: "11" },
        user: { role: "user", _id: "user-1" },
        body: { name: "Update" },
      };
      const res = createRes();
      const next = jest.fn();
      const campground = {
        owner: {
          toString: () => "owner-2",
        },
      };

      Campground.findById.mockResolvedValue(campground);

      await campgroundsController.updateCampground(req, res, next);

      expect(Campground.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Not authorized to update this campground",
      });
    });

    it("strips body.owner when a campOwner updates their own campground", async () => {
      const ownerId = "owner-1";
      const req = {
        params: { id: "11b" },
        user: { role: "campOwner", _id: ownerId },
        body: { name: "Owner Update", owner: "someone-else" },
      };
      const res = createRes();
      const next = jest.fn();
      const foundCampground = {
        owner: { toString: () => ownerId },
      };
      const updatedCampground = { _id: "11b", name: "Owner Update" };

      Campground.findById.mockResolvedValue(foundCampground);
      Campground.findByIdAndUpdate.mockResolvedValue(updatedCampground);

      await campgroundsController.updateCampground(req, res, next);

      expect(Campground.findByIdAndUpdate).toHaveBeenCalledWith(
        "11b",
        { name: "Owner Update" },
        { new: true, runValidators: true },
      );
      expect(req.body.owner).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: updatedCampground,
      });
    });

    it("updates campground for admin user", async () => {
      const req = {
        params: { id: "12" },
        user: { role: "admin", _id: "admin-1" },
        body: { name: "Updated" },
      };
      const res = createRes();
      const next = jest.fn();
      const foundCampground = {
        owner: {
          toString: () => "owner-1",
        },
      };
      const updatedCampground = { _id: "12", name: "Updated" };

      Campground.findById.mockResolvedValue(foundCampground);
      Campground.findByIdAndUpdate.mockResolvedValue(updatedCampground);

      await campgroundsController.updateCampground(req, res, next);

      expect(Campground.findByIdAndUpdate).toHaveBeenCalledWith(
        "12",
        { name: "Updated" },
        { new: true, runValidators: true },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: updatedCampground,
      });
    });

    it("returns 500 on update error", async () => {
      const req = {
        params: { id: "13" },
        user: { role: "admin", _id: "admin-1" },
        body: { name: "Updated" },
      };
      const res = createRes();
      const next = jest.fn();

      Campground.findById.mockRejectedValue(new Error("update error"));

      await campgroundsController.updateCampground(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  describe("deleteCampground", () => {
    it("returns 401 for non-admin users", async () => {
      const req = {
        params: { id: "20" },
        user: { role: "user" },
      };
      const res = createRes();
      const next = jest.fn();

      await campgroundsController.deleteCampground(req, res, next);

      expect(Campground.findById).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Only administrators can delete campgrounds",
      });
    });

    it("returns 404 when campground is not found", async () => {
      const req = {
        params: { id: "21" },
        user: { role: "admin" },
      };
      const res = createRes();
      const next = jest.fn();

      Campground.findById.mockResolvedValue(null);

      await campgroundsController.deleteCampground(req, res, next);

      expect(Booking.deleteMany).not.toHaveBeenCalled();
      expect(Campground.deleteOne).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Campground not found",
      });
    });

    it("deletes campground and its bookings", async () => {
      const req = {
        params: { id: "22" },
        user: { role: "admin" },
      };
      const res = createRes();
      const next = jest.fn();

      Campground.findById.mockResolvedValue({ _id: "22" });
      Booking.deleteMany.mockResolvedValue({ deletedCount: 2 });
      Campground.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await campgroundsController.deleteCampground(req, res, next);

      expect(Booking.deleteMany).toHaveBeenCalledWith({ campground: "22" });
      expect(Campground.deleteOne).toHaveBeenCalledWith({ _id: "22" });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: {} });
    });

    it("returns 500 on delete failure", async () => {
      const req = {
        params: { id: "23" },
        user: { role: "admin" },
      };
      const res = createRes();
      const next = jest.fn();
      const err = new Error("delete failed");
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      Campground.findById.mockRejectedValue(err);

      await campgroundsController.deleteCampground(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith("Delete Campground Error:", err);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false });

      consoleSpy.mockRestore();
    });
  });
});
