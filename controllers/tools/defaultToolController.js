const BaseToolController = require('./baseToolController');

/**
 * Default Tool Controller
 * Used for tools that don't have a specific implementation yet
 * Features are loaded from the database
 */
class DefaultToolController extends BaseToolController {
  constructor(toolId, toolFeatures = []) {
    super(toolId);
    this.toolFeatures = toolFeatures;
  }

  async getFeatures() {
    return this.toolFeatures;
  }

  async executeFeature(featureId, params, user = null) {
    const feature = this.toolFeatures.find(f => f.id === featureId);

    if (!feature) {
      throw new Error(`Feature '${featureId}' not found`);
    }

    const accessCheck = this.checkFeatureAccess(feature, user);
    if (!accessCheck.allowed) {
      throw new Error(accessCheck.reason);
    }

    // Default implementation - just returns a message
    return {
      success: true,
      message: `Feature '${featureId}' execution not yet implemented for tool '${this.toolId}'`,
      featureId,
      toolId: this.toolId,
      note: 'This tool does not have a specific controller implementation yet',
    };
  }
}

module.exports = DefaultToolController;

