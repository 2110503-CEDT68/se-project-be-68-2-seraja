const mongoose = require("mongoose");
require("dotenv").config({ path: "./config/config.env" });
const User = require("../models/User");
const Campground = require("../models/Campground");
const Booking = require("../models/Booking");

// ─── Database Connection ──────────────────────────────────────────────────────

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  }
};

// ─── Seed Data ────────────────────────────────────────────────────────────────

const seedAdmins = [
  {
    name: "Admin Primary",
    tel: "0800000001",
    email: "admin1@example.com",
    role: "admin",
    password: "admin123",
  },
  {
    name: "Admin Secondary",
    tel: "0800000002",
    email: "admin2@example.com",
    role: "admin",
    password: "admin123",
  },
];

const seedCampOwner = {
  name: "James Owner",
  tel: "0812345678",
  email: "james.owner@example.com",
  role: "campOwner",
  password: "password123",
};

const seedUsers = [
  {
    name: "James One",
    tel: "0812345678",
    email: "james.one@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Two",
    tel: "0812345679",
    email: "james.two@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Three",
    tel: "0812345680",
    email: "james.three@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Four",
    tel: "0812345681",
    email: "james.four@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Five",
    tel: "0812345682",
    email: "james.five@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Six",
    tel: "0812345683",
    email: "james.six@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Seven",
    tel: "0812345684",
    email: "james.seven@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Eight",
    tel: "0812345685",
    email: "james.eight@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Nine",
    tel: "0812345686",
    email: "james.nine@example.com",
    role: "user",
    password: "password123",
  },
  {
    name: "James Ten",
    tel: "0812345687",
    email: "james.ten@example.com",
    role: "user",
    password: "password123",
  },
];

// All 10 campgrounds belong to the single camp owner (assigned at runtime)
const seedCampgrounds = [
  {
    name: "Pine Mountain Camp",
    address: "123 Mountain Road",
    district: "Chiang Mai",
    province: "Chiang Mai",
    postalcode: "50000",
    tel: "0811111111",
    region: "North",
    capacity: 1,
  },
  {
    name: "Green Valley Resort",
    address: "456 Valley Lane",
    district: "Kamphaengphet",
    province: "Kamphaengphet",
    postalcode: "62000",
    tel: "0822222222",
    region: "North",
    capacity: 1,
  },
  {
    name: "Riverside Paradise",
    address: "789 River Road",
    district: "Phetchabun",
    province: "Phetchabun",
    postalcode: "67000",
    tel: "0833333333",
    region: "Central",
    capacity: 1,
  },
  {
    name: "Sunset Beach Camp",
    address: "321 Beach Way",
    district: "Rayong",
    province: "Rayong",
    postalcode: "21000",
    tel: "0844444444",
    region: "East",
    capacity: 1,
  },
  {
    name: "Forest Escape Retreat",
    address: "654 Forest Trail",
    district: "Nakhon Ratchasima",
    province: "Nakhon Ratchasima",
    postalcode: "30000",
    tel: "0855555555",
    region: "Isaan",
    capacity: 1,
  },
  {
    name: "Mountain Peak Adventure",
    address: "987 Peak Street",
    district: "Phitsanulok",
    province: "Phitsanulok",
    postalcode: "65000",
    tel: "0866666666",
    region: "North",
    capacity: 1,
  },
  {
    name: "Lakeside Comfort Camp",
    address: "147 Lake View Drive",
    district: "Surat Thani",
    province: "Surat Thani",
    postalcode: "84000",
    tel: "0877777777",
    region: "South",
    capacity: 1,
  },
  {
    name: "Tropical Nature Lodge",
    address: "258 Jungle Path",
    district: "Hat Yai",
    province: "Songkhla",
    postalcode: "90000",
    tel: "0888888888",
    region: "South",
    capacity: 1,
  },
  {
    name: "Desert Oasis Camp",
    address: "369 Oasis Road",
    district: "Nakhon Sawan",
    province: "Nakhon Sawan",
    postalcode: "60000",
    tel: "0899999999",
    region: "Central",
    capacity: 1,
  },
  {
    name: "Starlight Meadows Camp",
    address: "741 Meadow Lane",
    district: "Lampang",
    province: "Lampang",
    postalcode: "52000",
    tel: "0810101010",
    region: "North",
    capacity: 1,
  },
];

// ─── Booking Factory ──────────────────────────────────────────────────────────

/**
 * Generates a booking object with dates expressed as offsets from today.
 * @param {object}  opts
 * @param {object}  today         - Base Date
 * @param {object}  [opts.user]   - Mongoose User document (registered user)
 * @param {string}  [opts.guestName]
 * @param {string}  [opts.guestTel]
 * @param {object}  opts.campground - Mongoose Campground document
 * @param {number}  opts.checkInOffset  - Days relative to today (negative = past)
 * @param {number}  opts.checkOutOffset
 * @param {string}  [opts.checkInTime]  - Time in HH:mm format (24h)
 * @param {string}  [opts.checkOutTime] - Time in HH:mm format (24h)
 * @param {string}  opts.status   - "confirmed" | "checked-in" | "checked-out" | "cancelled"
 * @param {number}  [opts.cancelledAtOffset] - Required when status === "cancelled"
 * @param {string}  [opts.actualCheckInTime] - Time in HH:mm format (24h)
 * @param {string}  [opts.actualCheckOutTime] - Time in HH:mm format (24h)
 * @param {string}  [opts.cancelledAtTime] - Time in HH:mm format (24h)
 * @param {number}  [opts.actualCheckInOffset]
 * @param {number}  [opts.actualCheckOutOffset]
 */
const makeBooking = (today, opts) => {
  const daysMs = (n) => n * 24 * 60 * 60 * 1000;
  const offset = (n) => new Date(today.getTime() + daysMs(n));
  const withTime = (dayOffset, time) => {
    const date = offset(dayOffset);

    if (!time) return date;

    const [hour, minute] = String(time)
      .split(":")
      .map((part) => Number.parseInt(part, 10));
    const safeHour = Number.isInteger(hour)
      ? Math.min(Math.max(hour, 0), 23)
      : 0;
    const safeMinute = Number.isInteger(minute)
      ? Math.min(Math.max(minute, 0), 59)
      : 0;

    date.setHours(safeHour, safeMinute, 0, 0);
    return date;
  };

  const booking = {
    campground: opts.campground._id,
    checkInDate: withTime(opts.checkInOffset, opts.checkInTime),
    checkOutDate: withTime(opts.checkOutOffset, opts.checkOutTime),
    status: opts.status,
  };

  if (opts.user) booking.user = opts.user._id;
  if (opts.guestName) booking.guestName = opts.guestName;
  if (opts.guestTel) booking.guestTel = opts.guestTel;
  if (opts.actualCheckInOffset !== undefined)
    booking.actualCheckIn = withTime(
      opts.actualCheckInOffset,
      opts.actualCheckInTime,
    );
  if (opts.actualCheckOutOffset !== undefined)
    booking.actualCheckOut = withTime(
      opts.actualCheckOutOffset,
      opts.actualCheckOutTime,
    );
  if (opts.cancelledAtOffset !== undefined)
    booking.cancelledAt = withTime(
      opts.cancelledAtOffset,
      opts.cancelledAtTime,
    );

  return booking;
};

// ─── Main Seeder ──────────────────────────────────────────────────────────────

const seedDatabase = async () => {
  try {
    await connectDB();

    // ── Teardown ────────────────────────────────────────────────────────────
    console.log("Clearing existing data...");
    await Booking.deleteMany({});
    await Campground.deleteMany({});
    await User.deleteMany({});

    // ── Admins ──────────────────────────────────────────────────────────────
    console.log("\nCreating admin users...");
    const admins = [];
    for (const data of seedAdmins) {
      const admin = await User.create(data);
      admins.push(admin);
      console.log(`  ✓ Admin: ${admin.email}`);
    }

    // ── Camp Owner ──────────────────────────────────────────────────────────
    console.log("\nCreating camp owner...");
    const campOwner = await User.create(seedCampOwner);
    console.log(`  ✓ Camp owner: ${campOwner.email}`);

    // ── Regular Users ───────────────────────────────────────────────────────
    console.log("\nCreating regular users...");
    const users = [];
    for (const data of seedUsers) {
      const user = await User.create(data);
      users.push(user);
      console.log(`  ✓ User: ${user.email}`);
    }

    // ── Campgrounds (all owned by the single campOwner) ─────────────────────
    console.log("\nCreating campgrounds...");
    const campgrounds = [];
    for (const data of seedCampgrounds) {
      const campground = await Campground.create({
        ...data,
        owner: campOwner._id,
      });
      campgrounds.push(campground);
      console.log(`  ✓ Campground: ${campground.name}`);
    }

    // ── Bookings ────────────────────────────────────────────────────────────
    console.log("\nCreating bookings...");
    const today = new Date();
    const [jamesOne, jamesTwo, jamesThree, jamesFour, jamesFive, jamesSix] =
      users;
    // const [cg0, cg1, cg2, cg3, cg4] = campgrounds;

    const bookingSpecs = [
      // 1. James One — normal confirmed booking
      {
        user: jamesOne,
        campground: campgrounds[0],
        checkInOffset: 0,
        checkOutOffset: 2,
        status: "confirmed",
      },
      // 2. James Two — late checkout, still checked in
      {
        user: jamesTwo,
        campground: campgrounds[1],
        checkInOffset: -1,
        checkOutOffset: 0,
        checkInTime: "15:00",
        checkOutTime: "11:00",

        actualCheckInOffset: -1,
        actualCheckInTime: "15:20",

        status: "checked-in",
      },
      // 3. James Three — normal check-in
      {
        user: jamesThree,
        campground: campgrounds[0],
        checkInOffset: 0,
        checkOutOffset: 2,
        actualCheckInOffset: 0,
        status: "checked-in",
      },
      // 4. James Four — late checkout and already checked out
      {
        user: jamesFour,
        campground: campgrounds[3],
        checkInOffset: -1,
        checkOutOffset: 0,
        checkInTime: "15:00",
        checkOutTime: "11:00",
        actualCheckInOffset: -1,
        actualCheckInTime: "15:10",
        actualCheckOutOffset: 0,
        actualCheckOutTime: "13:45",
        status: "checked-out",
      },
      // 5. Random mix: confirmed registered user
      {
        user: jamesFive,
        campground: campgrounds[4],
        checkInOffset: 0,
        checkOutOffset: 2,
        status: "confirmed",
      },
      // 6. Random mix: confirmed guest booking
      {
        guestName: "Maya Chen",
        guestTel: "0634567890",
        campground: campgrounds[5],
        checkInOffset: 1,
        checkOutOffset: 3,
        status: "confirmed",
      },
      // 7. Random mix: checked-in registered user
      {
        user: jamesSix,
        campground: campgrounds[6],
        checkInOffset: -1,
        checkOutOffset: 2,
        actualCheckInOffset: -1,
        status: "checked-in",
      },
      // 8. Random mix: cancelled guest booking
      {
        guestName: "Noah Park",
        guestTel: "0645678901",
        campground: campgrounds[7],
        checkInOffset: 0,
        checkOutOffset: 1,
        cancelledAtOffset: -1,
        status: "cancelled",
      },
      // 9. Random mix: checked-out registered user
      {
        user: users[7],
        campground: campgrounds[8],
        checkInOffset: -2,
        checkOutOffset: -1,
        actualCheckInOffset: -2,
        actualCheckOutOffset: -1,
        status: "checked-out",
      },
      // 10. Random mix: cancelled registered user
      {
        user: users[8],
        campground: campgrounds[9],
        checkInOffset: 0,
        checkOutOffset: 2,
        cancelledAtOffset: 0,
        status: "cancelled",
      },
    ];

    for (const spec of bookingSpecs) {
      const booking = makeBooking(today, spec);
      await Booking.create(booking);
      const actor = spec.user
        ? `user: ${spec.user.email}`
        : `guest: ${spec.guestName}`;
      console.log(
        `  ✓ Booking [${spec.status}] — ${actor} @ ${spec.campground.name}`,
      );
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log("\n✓✓✓ Database seeding completed successfully! ✓✓✓");
    console.log(`\nSummary:`);
    console.log(`  Admins       : ${admins.length}`);
    console.log(`  Camp owners  : 1  (${campOwner.email})`);
    console.log(`  Users        : ${users.length}`);
    console.log(
      `  Campgrounds  : ${campgrounds.length}  (all owned by ${campOwner.email})`,
    );
    console.log(`  Bookings     : ${bookingSpecs.length}`);
    process.exit(0);
  } catch (err) {
    console.error("Error seeding database:", err);
    process.exit(1);
  }
};

// ─── Entry Point ──────────────────────────────────────────────────────────────

seedDatabase();
