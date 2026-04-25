const User = require("../models/User");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, tel, email, password, role } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    // only user and campOwner can self-register
    const allowedRoles = ["user", "campOwner"];
    const assignedRole = allowedRoles.includes(role) ? role : "user";

    // Create user
    const user = await User.create({
      name,
      tel,
      email: normalizedEmail,
      password,
      role: assignedRole,
    });

    // Send token response
    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(err.stack);
    res.status(400).json({
      success: false,
      error: "Registration failed",
    });
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim();

    // Validate input
    if (!normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide an email and password",
      });
    }

    // Find user (include password explicitly)
    const user = await User.findOne({
      email: new RegExp(`^${escapeRegExp(normalizedEmail)}$`, "i"),
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Check password match
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Send token response
    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(err.stack);
    res.status(401).json({
      success: false,
      error: "Login failed",
    });
  }
};

// 🔐 Helper Function
// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create JWT
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
  };

  // Only secure in production
  if (process.env.NODE_ENV === "production") {
    options.secure = true;
  }

  res.status(statusCode).cookie("token", token, options).json({
    success: true,
    token,
  });
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    // req.user is set from protect middleware
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

//@desc    Log user out / clear cookie
//@route   GET /api/v1/auth/logout
//@access  Private
exports.logout = async (req, res, next) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    data: {},
  });
};
