/**
 * Escape a user-supplied value so it can be safely embedded in a RegExp.
 * Prevents regex injection / ReDoS and crashes from non-string input.
 */
const escapeRegex = (value) => String(value == null ? '' : value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive exact-match regex for a user-supplied value. */
const exactMatchRegex = (value) => new RegExp(`^${escapeRegex(String(value).trim())}$`, 'i');

/** Case-insensitive "contains" regex for a user-supplied value. */
const containsRegex = (value) => new RegExp(escapeRegex(String(value).trim()), 'i');

module.exports = { escapeRegex, exactMatchRegex, containsRegex };
