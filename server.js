const { setServers } = require("node:dns/promises");
setServers(["1.1.1.1", "8.8.8.8"]);

const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const { xss } = require('express-xss-sanitizer');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const cors = require('cors');

dotenv.config({ path: './config/config.env' });

const connectDB = require('./config/db');
connectDB();

const auth = require('./routes/auth');
const campgrounds = require('./routes/campgrounds');
const bookings = require('./routes/bookings');

const app = express();

app.set('trust proxy', 1)

app.set('query parser', 'extended');
app.use(express.json());
app.use(cookieParser());

// security middlewares
app.use(mongoSanitize());
app.use(helmet());
app.use(xss());

app.use(
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(hpp());
app.use(cors());

// routes
app.use('/api/v1/auth', auth);
app.use('/api/v1/campgrounds', campgrounds);
app.use('/api/v1/bookings', bookings);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () =>
  console.log("Server running in", process.env.NODE_ENV, "mode on port", PORT)
);

process.on("unhandledRejection", (err) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});