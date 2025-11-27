const express = require('express');
const router = express.Router();
const Tool = require('../models/Tool');
const { protect, authorize } = require('../middleware/auth');

// GET all tools
router.get('/', async (req, res) => {
  try {
    const tools = await Tool.find().sort({ createdAt: -1 });
    res.json(tools);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET a single tool by ID
router.get('/:id', async (req, res) => {
  try {
    const tool = await Tool.findOne({ id: req.params.id });
    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }
    res.json(tool);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create a new tool - Admin only
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { id, name, icon, description, category, status, url } = req.body;

    // Validate required fields
    if (!id || !name || !icon || !description || !category || !url) {
      return res.status(400).json({ 
        message: 'All fields (id, name, icon, description, category, url) are required' 
      });
    }

    // Validate status
    if (status && !['available', 'coming-soon'].includes(status)) {
      return res.status(400).json({ 
        message: 'Status must be either "available" or "coming-soon"' 
      });
    }

    // Validate category
    const validCategories = ['Analytics', 'Planning', 'Academic', 'Document', 'File Sharing'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ 
        message: `Category must be one of: ${validCategories.join(', ')}` 
      });
    }

    const tool = new Tool({
      id,
      name,
      icon,
      description,
      category,
      status: status || 'available',
      url,
    });

    const newTool = await tool.save();
    res.status(201).json(newTool);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Tool with this ID already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

// PUT update a tool - Admin only
router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, icon, description, category, status, url } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (icon) updateData.icon = icon;
    if (description) updateData.description = description;
    if (category) {
      const validCategories = ['Analytics', 'Planning', 'Academic', 'Document', 'File Sharing'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ 
          message: `Category must be one of: ${validCategories.join(', ')}` 
        });
      }
      updateData.category = category;
    }
    if (status) {
      if (!['available', 'coming-soon'].includes(status)) {
        return res.status(400).json({ 
          message: 'Status must be either "available" or "coming-soon"' 
        });
      }
      updateData.status = status;
    }
    if (url) updateData.url = url;

    const tool = await Tool.findOneAndUpdate(
      { id: req.params.id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    res.json(tool);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE a tool - Admin only
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const tool = await Tool.findOneAndDelete({ id: req.params.id });
    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    res.json({ message: 'Tool deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET tools by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const tools = await Tool.find({ category }).sort({ createdAt: -1 });
    res.json(tools);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET tools by status
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    
    if (!['available', 'coming-soon'].includes(status)) {
      return res.status(400).json({ 
        message: 'Status must be either "available" or "coming-soon"' 
      });
    }

    const tools = await Tool.find({ status }).sort({ createdAt: -1 });
    res.json(tools);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

