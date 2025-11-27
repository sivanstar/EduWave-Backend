/**
 * Base Tool Controller
 * All tool-specific controllers should extend this class
 */
class BaseToolController {
  constructor(toolId) {
    this.toolId = toolId;
  }

  /**
   * Get available features for this tool
   * @returns {Array} Array of feature objects
   */
  async getFeatures() {
    throw new Error('getFeatures() must be implemented by subclass');
  }

  /**
   * Execute a specific feature
   * @param {String} featureId - The ID of the feature to execute
   * @param {Object} params - Parameters for the feature
   * @param {Object} user - The authenticated user (if applicable)
   * @returns {Object} Result of the feature execution
   */
  async executeFeature(featureId, params, user = null) {
    throw new Error('executeFeature() must be implemented by subclass');
  }

  /**
   * Validate feature parameters
   * @param {String} featureId - The feature ID
   * @param {Object} params - Parameters to validate
   * @param {Array} requiredParams - Array of required parameter definitions
   * @returns {Object} { valid: Boolean, errors: Array }
   */
  validateParams(params, requiredParams) {
    const errors = [];

    if (!requiredParams || requiredParams.length === 0) {
      return { valid: true, errors: [] };
    }

    requiredParams.forEach(param => {
      if (param.required && (params[param.name] === undefined || params[param.name] === null)) {
        errors.push(`Parameter '${param.name}' is required`);
        return;
      }

      if (params[param.name] !== undefined && param.type) {
        const paramType = typeof params[param.name];
        const expectedType = param.type.toLowerCase();

        if (expectedType === 'array' && !Array.isArray(params[param.name])) {
          errors.push(`Parameter '${param.name}' must be an array`);
        } else if (expectedType === 'object' && (paramType !== 'object' || Array.isArray(params[param.name]))) {
          errors.push(`Parameter '${param.name}' must be an object`);
        } else if (expectedType === 'number' && paramType !== 'number') {
          errors.push(`Parameter '${param.name}' must be a number`);
        } else if (expectedType === 'boolean' && paramType !== 'boolean') {
          errors.push(`Parameter '${param.name}' must be a boolean`);
        } else if (expectedType === 'string' && paramType !== 'string') {
          errors.push(`Parameter '${param.name}' must be a string`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if user has access to a feature
   * @param {Object} feature - Feature object
   * @param {Object} user - User object
   * @returns {Object} { allowed: Boolean, reason: String }
   */
  checkFeatureAccess(feature, user) {
    if (feature.requiresAuth && !user) {
      return { allowed: false, reason: 'Authentication required' };
    }

    // Check premium requirement - handle different possible premium field names
    if (feature.requiresPremium && user) {
      const isPremium = user.isPremium || user.subscription?.isPremium || user.subscription?.active;
      if (!isPremium) {
        return { allowed: false, reason: 'Premium subscription required' };
      }
    }

    return { allowed: true, reason: 'Access granted' };
  }
}

module.exports = BaseToolController;

