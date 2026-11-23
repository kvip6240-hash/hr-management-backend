const mongoose = require('mongoose');

/**
 * Atomic sequence counters (e.g. auto-generated employee IDs).
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
  },
  { versionKey: false }
);

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Atomically reserve the next value of a sequence.
 * `initialValue` seeds the counter the first time it is used.
 */
Counter.next = async function next(name, initialValue = 0) {
  await Counter.updateOne({ _id: name }, { $setOnInsert: { seq: initialValue } }, { upsert: true });
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true });
  return doc.seq;
};

module.exports = Counter;
