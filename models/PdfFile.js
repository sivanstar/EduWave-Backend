const mongoose = require('mongoose');

const pdfFileSchema = new mongoose.Schema({
  shareableLink: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  mimeType: {
    type: String,
    default: 'application/pdf',
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Expires in 24 hours
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PdfFile', pdfFileSchema);

