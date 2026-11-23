const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rawPort = parseInt(process.env.PORT, 10);
const port = (!isNaN(rawPort) && rawPort >= 0) ? rawPort : 5000;

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const DEFAULT_JWT_SECRET = 'default_jwt_secret_change_in_production_min_32_chars';
const DEFAULT_JWT_REFRESH_SECRET = 'default_jwt_refresh_secret_change_in_production';

const rawAuthLimit = parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10);

const env = {
  port,
  nodeEnv,
  isProduction,
  // Password-reset tokens are returned in the API response only when NODE_ENV is explicitly
  // development/test (there is no email delivery yet). Never when NODE_ENV is unset.
  exposeResetToken: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  // Max auth requests per IP+email per 15 minutes
  authRateLimitMax: !isNaN(rawAuthLimit) && rawAuthLimit > 0 ? rawAuthLimit : (nodeEnv === 'test' ? 10000 : 20),
  mongoServerSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 10) || 10000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr_management',
  birthdayTimeZone: process.env.BIRTHDAY_TIMEZONE || 'Asia/Kolkata',
  
  jwt: {
    secret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || DEFAULT_JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  
  clientUrl: process.env.CLIENT_URL || 'http://localhost:51834,http://localhost:3000',

  // Outgoing email (password reset / new-account credentials). Optional.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  },
  // Frontend page that accepts ?token=... to finish a password reset (optional)
  passwordResetUrl: (process.env.PASSWORD_RESET_URL || '').trim(),
  minPasswordLength: 8,

  // Location is optional for staff login (both OFFICE and WORK_FROM_HOME). Kept for legacy client compatibility.
  staffLoginRequireLocation: process.env.STAFF_LOGIN_REQUIRE_LOCATION === 'true',
  
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@hrmanagement.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345'
  },

  seedSuperAdmin: {
    email: (process.env.SEED_SUPER_ADMIN_EMAIL || 'lysoftware@gmail.com').toLowerCase(),
    password: process.env.SEED_SUPER_ADMIN_PASSWORD || 'hrAdmin'
  }
};

// Fail fast on insecure production configuration instead of silently using defaults.
if (isProduction) {
  const problems = [];
  if (!process.env.MONGODB_URI) problems.push('MONGODB_URI is not set');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be set to a random value of at least 32 characters');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === DEFAULT_JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    problems.push('JWT_REFRESH_SECRET must be set to a random value of at least 32 characters');
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error(`[FATAL] Invalid production configuration:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
}

module.exports = env;
