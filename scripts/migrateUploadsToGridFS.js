/**
 * One-time migration: copy documents that exist only on local disk
 * (uploads/documents) into MongoDB GridFS so they survive redeploys.
 *
 *   node scripts/migrateUploadsToGridFS.js
 *
 * Safe to run repeatedly: documents that already have a stored copy are skipped.
 */
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../config/db');
const HRDocument = require('../models/HRDocument');
const { persistUploadedFile, findStoredFile } = require('../utils/fileStorage');

const uploadsRoot = path.resolve(__dirname, '..', 'uploads', 'documents');

(async () => {
  await connectDB();
  let copied = 0;
  let skipped = 0;
  let missing = 0;

  const docs = await HRDocument.find({});
  for (const doc of docs) {
    const existing = await findStoredFile({ storageId: doc.storageId, fileName: doc.fileName });
    if (existing) {
      if (!doc.storageId) {
        doc.storageId = existing._id;
        await doc.save();
      }
      skipped += 1;
      continue;
    }
    const localPath = path.join(uploadsRoot, path.basename(String(doc.fileName || '')));
    if (!doc.fileName || !fs.existsSync(localPath)) {
      missing += 1;
      console.warn(`Missing on disk, cannot migrate: ${doc._id} (${doc.fileName})`);
      continue;
    }
    const file = {
      path: localPath,
      filename: doc.fileName,
      originalname: doc.originalName,
      mimetype: doc.fileType,
      size: doc.fileSize
    };
    await persistUploadedFile(file, { migratedFromDisk: true });
    doc.storageId = file.storageId;
    await doc.save();
    copied += 1;
  }

  console.log(`GridFS migration finished: ${copied} copied, ${skipped} already stored, ${missing} missing on disk.`);
  await disconnectDB();
  process.exit(0);
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
