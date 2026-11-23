const mongoose = require('mongoose');
const { body, param, query } = require('express-validator');
const { validate } = require('./authValidator');

// Optional HR-set password: when given it must be 8+ chars with a letter and a number.
const checkOptionalPassword = (val) => {
  if (val === null || val === undefined || val === '') return true;
  if (typeof val !== 'string' || val.trim().length < 8 || val.length > 128) {
    throw new Error('Password must be 8-128 characters long');
  }
  if (!/[A-Za-z]/.test(val) || !/[0-9]/.test(val)) {
    throw new Error('Password must contain at least one letter and one number');
  }
  return true;
};

const createEmployeeValidator = [
  body('name')
    .optional()
    .trim(),
  body('fullName')
    .optional()
    .trim(),
  body('firstName')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('First name must be under 50 characters')
    .custom((val, { req }) => {
      if (!val && !req.body.name && !req.body.fullName) {
        throw new Error('First name is required');
      }
      return true;
    }),
  body('lastName')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Last name must be under 50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .optional({ nullable: true })
    .custom(checkOptionalPassword),
  body('employeeId')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Employee ID must be between 2 and 20 characters'),
  body('phone')
    .optional()
    .trim(),
  body('phoneNumber')
    .optional()
    .trim(),
  body('department')
    .trim()
    .notEmpty().withMessage('Department is required'),
  body('designation')
    .trim()
    .notEmpty().withMessage('Designation is required'),
  body('workMode')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Work mode must be under 50 characters'),
  body('employmentType')
    .optional()
    .isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'])
    .withMessage('Employment type must be FULL_TIME, PART_TIME, CONTRACT, or INTERN'),
  body('salary')
    .optional()
    .isFloat({ min: 0 }).withMessage('Salary must be a non-negative number'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED'])
    .withMessage('Status must be ACTIVE, INACTIVE, ON_LEAVE, TERMINATED, or RESIGNED'),
  body('gender')
    .optional()
    .isIn(['MALE', 'FEMALE', 'OTHER'])
    .withMessage('Gender must be MALE, FEMALE, or OTHER'),
  body('dateOfBirth')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '' || value === undefined) return true;
      if (typeof value === 'boolean') throw new Error('Date of birth must be a valid date');
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new Error('Date of birth must be a valid date');
      }
      if (d > new Date()) {
        throw new Error('Date of birth cannot be in the future');
      }
      return true;
    }),
  validate
];

const updateEmployeeValidator = [
  param('id')
    .custom((val) => {
      if (mongoose.Types.ObjectId.isValid(val) || /^[A-Za-z0-9_-]+$/.test(val)) {
        return true;
      }
      throw new Error('Invalid employee ID format');
    }),
  body('password')
    .optional({ nullable: true })
    .custom(checkOptionalPassword),
  body('name')
    .optional()
    .trim(),
  body('fullName')
    .optional()
    .trim(),
  body('firstName')
    .optional()
    .trim()
    .notEmpty().withMessage('First name cannot be empty'),
  body('lastName')
    .optional()
    .trim(),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('phone')
    .optional()
    .trim(),
  body('phoneNumber')
    .optional()
    .trim(),
  body('department')
    .optional()
    .trim()
    .notEmpty().withMessage('Department cannot be empty'),
  body('designation')
    .optional()
    .trim()
    .notEmpty().withMessage('Designation cannot be empty'),
  body('workMode')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Work mode must be under 50 characters'),
  body('employmentType')
    .optional()
    .isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'])
    .withMessage('Employment type must be FULL_TIME, PART_TIME, CONTRACT, or INTERN'),
  body('salary')
    .optional()
    .isFloat({ min: 0 }).withMessage('Salary must be a non-negative number'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED'])
    .withMessage('Status must be ACTIVE, INACTIVE, ON_LEAVE, TERMINATED, or RESIGNED'),
  body('dateOfBirth')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '' || value === undefined) return true;
      if (typeof value === 'boolean') throw new Error('Date of birth must be a valid date');
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new Error('Date of birth must be a valid date');
      }
      if (d > new Date()) {
        throw new Error('Date of birth cannot be in the future');
      }
      return true;
    }),
  validate
];

const rejectLeaveValidator = [
  param('id')
    .isMongoId().withMessage('Invalid leave ID format'),
  body('rejectionReason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Rejection reason must be under 500 characters'),
  validate
];

const mongoIdParamValidator = [
  param('id')
    .isMongoId().withMessage('Invalid ID format'),
  validate
];

const birthdaysValidator = [
  query('daysAhead')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('daysAhead must be a non-negative integer between 0 and 365'),
  validate
];

const hrDailyUpdatesQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('date')
    .optional()
    .trim()
    .custom((val) => {
      if (!val) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val) && isNaN(new Date(val).getTime())) {
        throw new Error('Date must be in YYYY-MM-DD format');
      }
      return true;
    }),
  query('startDate')
    .optional()
    .trim(),
  query('endDate')
    .optional()
    .trim(),
  validate
];

const departmentScheduleValidator = [
  (req, res, next) => {
    if (req.body && !req.body.department && req.params?.deptKey) {
      req.body.department = req.params.deptKey;
    }
    next();
  },
  body('department')
    .trim()
    .notEmpty().withMessage('Department is required'),
  body('checkInTime')
    .trim()
    .notEmpty().withMessage('Check-in time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Check-in time must be in HH:mm 24-hour format'),
  body('checkOutTime')
    .optional()
    .trim()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Check-out time must be in HH:mm 24-hour format'),
  body('gracePeriodMinutes')
    .optional()
    .isInt({ min: 0 }).withMessage('Grace period must be a non-negative integer'),
  body('timezone')
    .optional()
    .trim()
    .custom((val) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: val });
        return true;
      } catch (e) {
        throw new Error('Invalid IANA timezone');
      }
    }),
  body('effectiveDate')
    .optional()
    .isISO8601().withMessage('Effective date must be a valid ISO8601 date'),
  validate
];

// Invalid ObjectId route params → 400 (same status the services already returned)
const objectIdParam = (name) => (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params[name] || ''))) {
    return res.status(400).json({ success: false, message: `Invalid ${name}`, error: null });
  }
  return next();
};

const optionalString = (field, max) => body(field)
  .optional({ nullable: true })
  .isString().withMessage(`${field} must be a string`)
  .bail()
  .isLength({ max }).withMessage(`${field} must be at most ${max} characters`);

const createTaskValidator = [
  body().custom((_, { req }) => {
    if (!req.body || (!req.body.staffId && !req.body.employeeId)) {
      throw new Error('staffId or employeeId is required');
    }
    return true;
  }),
  body('staffId').optional({ nullable: true }).isString().withMessage('staffId must be a string'),
  body('employeeId').optional({ nullable: true }).isString().withMessage('employeeId must be a string'),
  body('description')
    .exists({ checkNull: true }).withMessage('Task description is required')
    .bail()
    .isString().withMessage('description must be a string')
    .bail()
    .trim()
    .notEmpty().withMessage('Task description is required')
    .isLength({ max: 5000 }).withMessage('description must be at most 5000 characters'),
  optionalString('title', 200),
  optionalString('department', 100),
  body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be a valid date'),
  validate
];

const updateTaskValidator = [
  objectIdParam('id'),
  optionalString('description', 5000),
  optionalString('title', 200),
  optionalString('department', 100),
  body('staffId').optional({ nullable: true }).isString().withMessage('staffId must be a string'),
  body('employeeId').optional({ nullable: true }).isString().withMessage('employeeId must be a string'),
  body('status').optional({ nullable: true }).isString().withMessage('status must be a string'),
  body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be a valid date'),
  validate
];


module.exports = {
  createTaskValidator,
  updateTaskValidator,
  objectIdParam,
  birthdaysValidator,
  createEmployeeValidator,
  updateEmployeeValidator,
  rejectLeaveValidator,
  mongoIdParamValidator,
  hrDailyUpdatesQueryValidator,
  departmentScheduleValidator
};

