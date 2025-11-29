const PDFDocument = require('pdfkit');

// Generate PDF from text
exports.generatePDF = async (req, res) => {
  try {
    const { text, fileName = 'document', fontSize = 12, lineSpacing = 1.5, pageMargin = 20 } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Text is required',
      });
    }

    // Create PDF document
    const doc = new PDFDocument({
      margins: {
        top: pageMargin,
        bottom: pageMargin,
        left: pageMargin,
        right: pageMargin,
      },
    });

    // Set response headers
    const safeFileName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'document';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Set font and size
    doc.fontSize(fontSize);

    // Set line spacing
    doc.lineGap(fontSize * (lineSpacing - 1));

    // Add text (PDFKit handles line wrapping and page breaks automatically)
    doc.text(text, {
      align: 'left',
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

