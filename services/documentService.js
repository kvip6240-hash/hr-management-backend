const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const HRDocument = require('../models/HRDocument');
const Employee = require('../models/Employee');
const { AppError } = require('../middleware/errorMiddleware');
const { findStoredFile, deleteStoredFile } = require('../utils/fileStorage');

class DocumentService {
  /**
   * Resolve employee by Mongo ObjectId or employeeId string
   */
  async resolveEmployee(idOrEmpId) {
    let query = {};
    if (mongoose.Types.ObjectId.isValid(idOrEmpId)) {
      query = { $or: [{ _id: idOrEmpId }, { employeeId: idOrEmpId.toUpperCase() }] };
    } else {
      query = { employeeId: idOrEmpId.toUpperCase() };
    }
    const employee = await Employee.findOne(query);
    if (!employee) {
      throw new AppError('Employee not found', 404);
    }
    return employee;
  }

  /**
   * Upload / create new HR document for an employee
   */
  async uploadDocument({ employeeId, file, title, category, description, issueDate, expiryDate, user }) {
    if (!file) {
      throw new AppError('Document file is required', 400);
    }

    const employee = await this.resolveEmployee(employeeId);

    const uploaderName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'HR Admin' : 'HR Admin';

    const relativePath = `/uploads/documents/${file.filename}`;

    const document = new HRDocument({
      employee: employee._id,
      employeeIdString: employee.employeeId,
      title: title ? title.trim() : file.originalname,
      category,
      description: description ? description.trim() : '',
      fileName: file.filename,
      originalName: file.originalname,
      filePath: relativePath,
      fileType: file.mimetype,
      fileSize: file.size,
      storageId: file.storageId || null,
      issueDate: issueDate || '',
      expiryDate: expiryDate || '',
      uploadedBy: uploaderName,
      uploadedByUserId: user ? user._id : null,
      status: 'ACTIVE',
      version: 1,
      history: [
        {
          action: 'UPLOADED',
          performedBy: uploaderName,
          timestamp: new Date(),
          notes: 'Initial document upload'
        }
      ]
    });

    await document.save();
    return document;
  }

  /**
   * Get all documents for an employee
   */
  async getEmployeeDocuments(employeeId, { includeArchived = false } = {}) {
    const employee = await this.resolveEmployee(employeeId);

    const query = { employee: employee._id };
    if (!includeArchived) {
      query.status = { $ne: 'ARCHIVED' };
    }

    const docs = await HRDocument.find(query).sort({ createdAt: -1 }).lean();
    return docs;
  }

  /**
   * Replace an existing document with a new file
   */
  async replaceDocument(docId, { file, title, description, issueDate, expiryDate, user }) {
    if (!file) {
      throw new AppError('Replacement file is required', 400);
    }

    const document = await HRDocument.findById(docId);
    if (!document) {
      throw new AppError('Document not found', 404);
    }

    const uploaderName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'HR Admin' : 'HR Admin';
    const oldFileName = document.fileName;
    const oldStorageId = document.storageId;
    const oldFilePath = path.join(__dirname, '..', 'uploads', 'documents', path.basename(String(document.fileName || '')));

    // Record history
    document.history.push({
      action: 'REPLACED',
      performedBy: uploaderName,
      timestamp: new Date(),
      notes: `Replaced with new file "${file.originalname}"`,
      previousFileName: oldFileName
    });

    // Update document
    document.fileName = file.filename;
    document.originalName = file.originalname;
    document.filePath = `/uploads/documents/${file.filename}`;
    document.fileType = file.mimetype;
    document.fileSize = file.size;
    document.storageId = file.storageId || null;
    if (title) document.title = title.trim();
    if (description !== undefined) document.description = description.trim();
    if (issueDate !== undefined) document.issueDate = issueDate;
    if (expiryDate !== undefined) document.expiryDate = expiryDate;
    document.version = (document.version || 1) + 1;
    document.uploadedBy = uploaderName;

    await document.save();

    // Optionally cleanup old file if it exists and isn't the same
    try {
      if (fs.existsSync(oldFilePath) && oldFileName !== file.filename) {
        fs.unlinkSync(oldFilePath);
      }
    } catch (_) {}
    if (oldFileName !== file.filename) {
      await deleteStoredFile({ storageId: oldStorageId, fileName: oldFileName });
    }

    return document;
  }

  /**
   * Archive a document
   */
  async archiveDocument(docId, user) {
    const document = await HRDocument.findById(docId);
    if (!document) {
      throw new AppError('Document not found', 404);
    }

    const uploaderName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'HR Admin' : 'HR Admin';

    document.status = 'ARCHIVED';
    document.history.push({
      action: 'ARCHIVED',
      performedBy: uploaderName,
      timestamp: new Date(),
      notes: 'Document archived by HR'
    });

    await document.save();
    return document;
  }

  /**
   * Get document file for download/preview with authorization check
   */
  async getDocumentFile(docId, user) {
    if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
      throw new AppError('Invalid document ID', 400);
    }

    const document = await HRDocument.findById(docId).populate('employee');
    if (!document) {
      throw new AppError('Document not found', 404);
    }

    // Role check: HR and SUPER_ADMIN can view any employee document.
    // Staff can only view documents belonging to their own employee profile.
    if (user.role === 'STAFF') {
      const staffEmp = await Employee.findOne({ user: user._id });
      const docEmpId = document.employee?._id || document.employee;
      if (!staffEmp || String(staffEmp._id) !== String(docEmpId)) {
        throw new AppError('You are not authorized to access this document', 403);
      }
    }
    // HR and SUPER_ADMIN bypass ownership check (they can view any employee's documents)

    // Only ever serve files that live inside uploads/documents (blocks path traversal
    // through crafted filePath/fileName values such as "../../.env").
    const uploadsRoot = path.resolve(__dirname, '..', 'uploads', 'documents');
    const insideUploads = (candidate) => candidate === uploadsRoot || candidate.startsWith(uploadsRoot + path.sep);

    let absolutePath = null;
    if (document.filePath) {
      const cleanRel = String(document.filePath).replace(/^[/\\]+/, '');
      const candidate = path.resolve(__dirname, '..', cleanRel);
      if (insideUploads(candidate) && fs.existsSync(candidate)) {
        absolutePath = candidate;
      }
    }

    // Fallback: search in uploads/documents by fileName
    if (!absolutePath && document.fileName) {
      const fallback = path.resolve(uploadsRoot, path.basename(String(document.fileName)));
      if (insideUploads(fallback) && fs.existsSync(fallback)) {
        absolutePath = fallback;
      }
    }

    if (absolutePath && fs.existsSync(absolutePath)) {
      return { document, absolutePath, storedFile: null };
    }

    // Local disk is not durable on Render: fall back to the GridFS copy in MongoDB
    const storedFile = await findStoredFile({ storageId: document.storageId, fileName: document.fileName });
    if (!storedFile) {
      throw new AppError('Document file does not exist in storage', 404);
    }

    return {
      document,
      absolutePath: null,
      storedFile
    };
  }
}

module.exports = new DocumentService();
