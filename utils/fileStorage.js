/**
 * Durable document storage backed by MongoDB GridFS.
 *
 * Render (and most PaaS hosts) wipe the local disk on every deploy/restart, so
 * uploaded HR and medical documents are persisted into the database itself
 * (bucket "documents"). The local uploads/documents folder is kept only as a
 * cache / legacy location: reads try the disk first and fall back to GridFS.
 */
const fs = require('fs');
const mongoose = require('mongoose');
const logger = require('./logger');

const BUCKET_NAME = 'documents';

const getBucket = () => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('Database is not connected; cannot access document storage');
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
};

/**
 * Copy a multer disk-stored file into GridFS. Mutates `file` to add `storageId`.
 */
const persistUploadedFile = (file, metadata = {}) => new Promise((resolve, reject) => {
  if (!file || !file.path) return resolve(null);
  let bucket;
  try {
    bucket = getBucket();
  } catch (err) {
    return reject(err);
  }
  const uploadStream = bucket.openUploadStream(file.filename, {
    contentType: file.mimetype,
    metadata: { originalName: file.originalname, size: file.size, ...metadata }
  });
  fs.createReadStream(file.path)
    .on('error', reject)
    .pipe(uploadStream)
    .on('error', reject)
    .on('finish', () => {
      file.storageId = uploadStream.id;
      resolve(uploadStream.id);
    });
});

const findStoredFile = async ({ storageId, fileName }) => {
  const bucket = getBucket();
  if (storageId && mongoose.Types.ObjectId.isValid(storageId)) {
    const [byId] = await bucket.find({ _id: new mongoose.Types.ObjectId(String(storageId)) }).limit(1).toArray();
    if (byId) return byId;
  }
  if (fileName) {
    const [byName] = await bucket.find({ filename: String(fileName) }).sort({ uploadDate: -1 }).limit(1).toArray();
    if (byName) return byName;
  }
  return null;
};

const openDownloadStream = (storedFile) => getBucket().openDownloadStream(storedFile._id);

const deleteStoredFile = async ({ storageId, fileName }) => {
  try {
    const stored = await findStoredFile({ storageId, fileName });
    if (stored) await getBucket().delete(stored._id);
  } catch (err) {
    logger.warn(`Could not delete stored document ${fileName || storageId}: ${err.message}`);
  }
};

module.exports = {
  BUCKET_NAME,
  persistUploadedFile,
  findStoredFile,
  openDownloadStream,
  deleteStoredFile
};
