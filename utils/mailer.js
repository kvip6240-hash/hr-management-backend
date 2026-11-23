/**
 * Outgoing email (password reset, new-account credentials).
 *
 * Configure with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * (works with Gmail app passwords, Brevo, SendGrid SMTP, Amazon SES SMTP, ...).
 * When SMTP is not configured, emails are skipped and a warning is logged,
 * so the API keeps working in development.
 */
const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('./logger');

let transporter = null;

const isMailConfigured = () => Boolean(env.smtp.host && env.smtp.from);

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
    });
  }
  return transporter;
};

/**
 * Send an email. Never throws: returns true when sent, false otherwise.
 */
const sendMail = async ({ to, subject, text, html }) => {
  if (!isMailConfigured()) {
    logger.warn(`Email not sent (SMTP not configured): "${subject}"`);
    return false;
  }
  try {
    await getTransporter().sendMail({ from: env.smtp.from, to, subject, text, html });
    return true;
  } catch (err) {
    logger.error(`Failed to send email "${subject}": ${err.message}`);
    return false;
  }
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const sendPasswordResetEmail = (user, token) => {
  const base = env.passwordResetUrl;
  const link = base ? `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : null;
  const name = escapeHtml(user.firstName || 'there');
  const text = [
    `Hi ${user.firstName || 'there'},`,
    '',
    'We received a request to reset your HR Management password.',
    link ? `Reset it here (valid for 1 hour): ${link}` : `Your reset code (valid for 1 hour): ${token}`,
    '',
    'If you did not request this, you can ignore this email.'
  ].join('\n');
  const html = `<p>Hi ${name},</p><p>We received a request to reset your HR Management password.</p>${
    link
      ? `<p><a href="${escapeHtml(link)}">Reset your password</a> (valid for 1 hour)</p>`
      : `<p>Your reset code (valid for 1 hour): <b>${escapeHtml(token)}</b></p>`
  }<p>If you did not request this, you can ignore this email.</p>`;
  return sendMail({ to: user.email, subject: 'Reset your HR Management password', text, html });
};

const sendWelcomeEmail = (user, temporaryPassword) => {
  const text = [
    `Hi ${user.firstName || 'there'},`,
    '',
    'An HR Management account has been created for you.',
    `Email: ${user.email}`,
    `Temporary password: ${temporaryPassword}`,
    '',
    'Please sign in and change your password right away.'
  ].join('\n');
  const html = `<p>Hi ${escapeHtml(user.firstName || 'there')},</p><p>An HR Management account has been created for you.</p>`
    + `<p>Email: <b>${escapeHtml(user.email)}</b><br>Temporary password: <b>${escapeHtml(temporaryPassword)}</b></p>`
    + '<p>Please sign in and change your password right away.</p>';
  return sendMail({ to: user.email, subject: 'Your HR Management account', text, html });
};

module.exports = { isMailConfigured, sendMail, sendPasswordResetEmail, sendWelcomeEmail };
