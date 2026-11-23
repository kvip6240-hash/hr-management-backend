const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

/**
 * Generate Access Token for authenticated user
 * @param {Object} user 
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion || 0
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
};

/**
 * Generate Refresh Token for authenticated user
 * @param {Object} user 
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      tv: user.tokenVersion || 0
    },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );
};

/**
 * Verify Access Token
 * @param {string} token 
 * @returns {Object} Decoded payload
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, env.jwt.secret);
};

/**
 * Verify Refresh Token
 * @param {string} token 
 * @returns {Object} Decoded payload
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.jwt.refreshSecret);
};

/**
 * Generate a secure random password reset token and hash
 * @returns {{ token: string, hashedToken: string, expires: Date }}
 */
const generateResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  // Token expires in 1 hour
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  return { token, hashedToken, expires };
};

/**
 * Hash a given token with sha256
 * @param {string} token
 * @returns {string}
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * True when a decoded token was issued for the user's current token version
 * (tokens issued before logout / password change / deactivation are rejected).
 */
const isTokenVersionCurrent = (decoded, user) => (decoded.tv || 0) === (user.tokenVersion || 0);

module.exports = {
  isTokenVersionCurrent,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateResetToken,
  hashToken
};
