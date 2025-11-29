const PdfFile = require('../models/PdfFile');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

// Generate unique shareable link
function generateShareableLink() {
  return crypto.randomBytes(8).toString('hex');
}

// Upload PDF and generate shareable link
exports.uploadPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Generate unique shareable link
    let shareableLink = generateShareableLink();
    while (await PdfFile.findOne({ shareableLink })) {
      shareableLink = generateShareableLink();
    }

    // Create PDF file record (auth is optional)
    const pdfFile = await PdfFile.create({
      shareableLink,
      originalName: req.file.originalname,
      fileName: req.file.filename,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user ? req.user._id : undefined,
    });

    // Generate full URL
    const baseUrl = req.protocol + '://' + req.get('host');
    const shareableUrl = `${baseUrl}/api/pdf-to-link/files/${shareableLink}`;

    res.status(201).json({
      success: true,
      data: {
        shareableLink: shareableUrl,
        linkId: shareableLink,
        fileName: pdfFile.originalName,
        fileSize: pdfFile.fileSize,
        expiresAt: pdfFile.expiresAt,
        downloadCount: pdfFile.downloadCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Download PDF by shareable link
exports.downloadPDF = async (req, res) => {
  try {
    const { shareableLink } = req.params;

    const pdfFile = await PdfFile.findOne({ shareableLink });
    if (!pdfFile) {
      return res.status(404).json({
        success: false,
        message: 'File not found or link is invalid',
      });
    }

    // Check if link has expired
    if (pdfFile.expiresAt && new Date() > pdfFile.expiresAt) {
      return res.status(410).json({
        success: false,
        message: 'Link has expired',
      });
    }

    // Check if file exists on disk
    try {
      await fs.access(pdfFile.filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server',
      });
    }

    // Increment download count
    pdfFile.downloadCount += 1;
    await pdfFile.save();

    // Set headers and send file
    res.setHeader('Content-Type', pdfFile.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFile.originalName}"`);
    res.sendFile(path.resolve(pdfFile.filePath));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get PDF file info by shareable link
exports.getPDFInfo = async (req, res) => {
  try {
    const { shareableLink } = req.params;

    const pdfFile = await PdfFile.findOne({ shareableLink });
    if (!pdfFile) {
      return res.status(404).json({
        success: false,
        message: 'File not found or link is invalid',
      });
    }

    // Check if link has expired
    if (pdfFile.expiresAt && new Date() > pdfFile.expiresAt) {
      return res.status(410).json({
        success: false,
        message: 'Link has expired',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        fileName: pdfFile.originalName,
        fileSize: pdfFile.fileSize,
        downloadCount: pdfFile.downloadCount,
        expiresAt: pdfFile.expiresAt,
        createdAt: pdfFile.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

