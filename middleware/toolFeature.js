/**
 * Tool Feature Middleware
 * Validates tool feature access and requirements
 */

const Tool = require('../models/Tool');
const { getToolController, hasToolController } = require('../utils/toolRegistry');

/**
 * Middleware to validate tool feature access
 * Checks if tool exists, is available, and user has access
 */
exports.validateToolFeature = async (req, res, next) => {
  try {
    const { toolId, featureId } = req.params;

    // Check if tool exists
    const tool = await Tool.findOne({ id: toolId });
    if (!tool) {
      return res.status(404).json({
        success: false,
        message: 'Tool not found',
      });
    }

    // Check if tool is available
    if (tool.status !== 'available') {
      return res.status(403).json({
        success: false,
        message: `Tool is ${tool.status}. It is not available for use.`,
      });
    }

    // Attach tool to request
    req.tool = tool;

    // If featureId is provided, validate it
    if (featureId) {
      let feature = null;

      if (hasToolController(toolId)) {
        const controller = getToolController(toolId);
        const features = await controller.getFeatures();
        feature = features.find(f => f.id === featureId);
      } else if (tool.features && tool.features.length > 0) {
        feature = tool.features.find(f => f.id === featureId);
      }

      if (!feature) {
        return res.status(404).json({
          success: false,
          message: 'Feature not found',
        });
      }

      // Check feature access requirements
      if (feature.requiresAuth && !req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required for this feature',
        });
      }

      // Check premium requirement - handle different possible premium field names
      if (feature.requiresPremium && req.user) {
        const isPremium = req.user.isPremium || req.user.subscription?.isPremium || req.user.subscription?.active;
        if (!isPremium) {
          return res.status(403).json({
            success: false,
            message: 'Premium subscription required for this feature',
          });
        }
      }

      // Attach feature to request
      req.feature = feature;
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Middleware to check if user has premium access
 */
exports.requirePremium = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  const isPremium = req.user.isPremium || req.user.subscription?.isPremium || req.user.subscription?.active;
  if (!isPremium) {
    return res.status(403).json({
      success: false,
      message: 'Premium subscription required',
    });
  }

  next();
};

module.exports = exports;

