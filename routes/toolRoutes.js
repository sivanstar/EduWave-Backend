const express = require('express');
const router = express.Router();
const Tool = require('../models/Tool');
const { protect, authorize } = require('../middleware/auth');
const { getToolController, hasToolController } = require('../utils/toolRegistry');

// Optional auth middleware - attaches user if token is present, but doesn't require it
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'your-access-secret-key');
      req.user = await User.findById(decoded.id);
    } catch (error) {
      // If token is invalid, just continue without user
      req.user = null;
    }
  }

  next();
};

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
    const { id, name, icon, description, category, status, url, features, config, handler } = req.body;

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

    // Validate features if provided
    if (features && Array.isArray(features)) {
      for (const feature of features) {
        if (!feature.id || !feature.name) {
          return res.status(400).json({ 
            message: 'Each feature must have an id and name' 
          });
        }
      }
    }

    const toolData = {
      id,
      name,
      icon,
      description,
      category,
      status: status || 'available',
      url,
    };

    // Add optional fields
    if (features) toolData.features = features;
    if (config) toolData.config = config;
    if (handler) toolData.handler = handler;

    const tool = new Tool(toolData);
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
    const { name, icon, description, category, status, url, features, config, handler } = req.body;

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
    if (features !== undefined) {
      // Validate features if provided
      if (Array.isArray(features)) {
        for (const feature of features) {
          if (!feature.id || !feature.name) {
            return res.status(400).json({ 
              message: 'Each feature must have an id and name' 
            });
          }
        }
        updateData.features = features;
      } else {
        return res.status(400).json({ 
          message: 'Features must be an array' 
        });
      }
    }
    if (config !== undefined) updateData.config = config;
    if (handler !== undefined) updateData.handler = handler;

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

// ========================
// TOOL FEATURES ENDPOINTS
// ========================

// GET all features for a specific tool
router.get('/:toolId/features', optionalAuth, async (req, res) => {
  try {
    const { toolId } = req.params;

    // Check if tool exists in database
    const tool = await Tool.findOne({ id: toolId });
    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    // Check if tool has a registered controller
    if (!hasToolController(toolId)) {
      // Return features from database if available, otherwise empty array
      return res.json({
        success: true,
        toolId,
        features: tool.features || [],
        message: tool.features && tool.features.length > 0 
          ? 'Features retrieved from database' 
          : 'No features available for this tool',
      });
    }

    // Get features from controller
    const controller = getToolController(toolId);
    const features = await controller.getFeatures();

    res.json({
      success: true,
      toolId,
      features,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// GET a specific feature for a tool
router.get('/:toolId/features/:featureId', optionalAuth, async (req, res) => {
  try {
    const { toolId, featureId } = req.params;

    const tool = await Tool.findOne({ id: toolId });
    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    if (!hasToolController(toolId)) {
      // Check database for feature
      const feature = tool.features?.find(f => f.id === featureId);
      if (!feature) {
        return res.status(404).json({ message: 'Feature not found' });
      }
      return res.json({ success: true, feature });
    }

    const controller = getToolController(toolId);
    const features = await controller.getFeatures();
    const feature = features.find(f => f.id === featureId);

    if (!feature) {
      return res.status(404).json({ message: 'Feature not found' });
    }

    res.json({
      success: true,
      feature,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// POST execute a specific feature
router.post('/:toolId/features/:featureId/execute', optionalAuth, async (req, res) => {
  try {
    const { toolId, featureId } = req.params;
    const params = req.body;

    // Check if tool exists
    const tool = await Tool.findOne({ id: toolId });
    if (!tool) {
      return res.status(404).json({ 
        success: false,
        message: 'Tool not found' 
      });
    }

    // Check if tool is available
    if (tool.status !== 'available') {
      return res.status(403).json({ 
        success: false,
        message: `Tool is ${tool.status}. It is not available for use.` 
      });
    }

    // Check if tool has a registered controller
    if (!hasToolController(toolId)) {
      return res.status(501).json({ 
        success: false,
        message: 'Feature execution not implemented for this tool' 
      });
    }

    // Get controller and execute feature
    const controller = getToolController(toolId);
    const result = await controller.executeFeature(featureId, params, req.user || null);

    res.json({
      success: true,
      toolId,
      featureId,
      result,
    });
  } catch (error) {
    // Handle different error types
    if (error.message.includes('not found')) {
      return res.status(404).json({ 
        success: false,
        message: error.message 
      });
    }
    
    if (error.message.includes('required') || error.message.includes('Validation failed')) {
      return res.status(400).json({ 
        success: false,
        message: error.message 
      });
    }

    if (error.message.includes('Authentication required') || error.message.includes('Premium')) {
      return res.status(403).json({ 
        success: false,
        message: error.message 
      });
    }

    res.status(500).json({ 
      success: false,
      message: error.message || 'Internal server error' 
    });
  }
});

module.exports = router;

