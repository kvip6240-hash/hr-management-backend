/**
 * NoSQL injection guard.
 *
 * Removes object keys that start with "$" from req.body,
 * req.query and req.params, so that client input such as
 * `{ "email": { "$ne": null } }` or `?status[$ne]=x` can never reach a
 * Mongoose filter as a query operator.
 */
const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);

const sanitizeValue = (value, depth = 0) => {
  if (depth > 20) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = sanitizeValue(value[i], depth + 1);
    }
    return value;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$')) {
        delete value[key];
      } else {
        value[key] = sanitizeValue(value[key], depth + 1);
      }
    }
  }
  return value;
};

const sanitizeMiddleware = (req, res, next) => {
  if (req.body) sanitizeValue(req.body);
  if (req.query) sanitizeValue(req.query);
  if (req.params) sanitizeValue(req.params);
  next();
};

module.exports = { sanitizeMiddleware, sanitizeValue };
