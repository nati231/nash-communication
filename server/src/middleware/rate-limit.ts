import rateLimit from "express-rate-limit";

const ONE_MINUTE = 60 * 1000;
const FIFTEEN_MINUTES = 15 * ONE_MINUTE;
const ONE_HOUR = 60 * ONE_MINUTE;

// The counters live in the server's memory, so restarting the server resets them.

// Failed sign-ins only: a successful login does not use up an attempt.
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message:
      "Too many failed sign-in attempts. Please wait 15 minutes and try again.",
  },
});

// Every sign-up attempt counts, so one address can't create accounts in bulk.
export const registerLimiter = rateLimit({
  windowMs: ONE_HOUR,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many accounts were created from this address. Try again later.",
  },
});

// Only uploads (POST) are limited. Listing and downloading files are not.
export const uploadLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== "POST",
  message: {
    success: false,
    message: "You're uploading too quickly. Wait a minute and try again.",
  },
});