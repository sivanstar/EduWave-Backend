const BaseToolController = require('./baseToolController');

class CGPACalculatorController extends BaseToolController {
  constructor() {
    super('cgpa-calculator');
    this.features = [
      {
        id: 'calculate',
        name: 'Calculate CGPA',
        description: 'Calculate CGPA from course grades and credit hours',
        requiresAuth: false,
        requiresPremium: false,
        parameters: [
          {
            name: 'courses',
            type: 'array',
            required: true,
            description: 'Array of course objects with grade and creditHours',
          },
        ],
      },
      {
        id: 'save-calculation',
        name: 'Save Calculation',
        description: 'Save CGPA calculation to user history',
        requiresAuth: true,
        requiresPremium: false,
        parameters: [
          {
            name: 'courses',
            type: 'array',
            required: true,
            description: 'Array of course objects',
          },
          {
            name: 'cgpa',
            type: 'number',
            required: true,
            description: 'Calculated CGPA value',
          },
          {
            name: 'semester',
            type: 'string',
            required: false,
            description: 'Semester name or identifier',
          },
        ],
      },
      {
        id: 'get-history',
        name: 'Get Calculation History',
        description: 'Retrieve saved CGPA calculations',
        requiresAuth: true,
        requiresPremium: false,
        parameters: [
          {
            name: 'limit',
            type: 'number',
            required: false,
            description: 'Maximum number of records to return',
          },
        ],
      },
    ];
  }

  async getFeatures() {
    return this.features;
  }

  async executeFeature(featureId, params, user = null) {
    const feature = this.features.find(f => f.id === featureId);

    if (!feature) {
      throw new Error(`Feature '${featureId}' not found`);
    }

    // Check access
    const accessCheck = this.checkFeatureAccess(feature, user);
    if (!accessCheck.allowed) {
      throw new Error(accessCheck.reason);
    }

    // Validate parameters
    const validation = this.validateParams(params, feature.parameters);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    switch (featureId) {
      case 'calculate':
        return this.calculateCGPA(params.courses);

      case 'save-calculation':
        return this.saveCalculation(params, user);

      case 'get-history':
        return this.getHistory(user, params.limit || 10);

      default:
        throw new Error(`Feature '${featureId}' not implemented`);
    }
  }

  calculateCGPA(courses) {
    if (!Array.isArray(courses) || courses.length === 0) {
      throw new Error('Courses array is required and must not be empty');
    }

    const gradePoints = {
      'A+': 4.5, 'A': 4.0, 'A-': 3.75,
      'B+': 3.5, 'B': 3.0, 'B-': 2.75,
      'C+': 2.5, 'C': 2.0, 'C-': 1.75,
      'D+': 1.5, 'D': 1.0, 'F': 0.0,
    };

    let totalPoints = 0;
    let totalCredits = 0;

    courses.forEach((course, index) => {
      if (!course.grade || !course.creditHours) {
        throw new Error(`Course at index ${index} must have grade and creditHours`);
      }

      const grade = course.grade.toUpperCase();
      if (!gradePoints[grade]) {
        throw new Error(`Invalid grade '${course.grade}' at index ${index}`);
      }

      const creditHours = parseFloat(course.creditHours);
      if (isNaN(creditHours) || creditHours <= 0) {
        throw new Error(`Invalid creditHours '${course.creditHours}' at index ${index}`);
      }

      totalPoints += gradePoints[grade] * creditHours;
      totalCredits += creditHours;
    });

    if (totalCredits === 0) {
      throw new Error('Total credit hours cannot be zero');
    }

    const cgpa = totalPoints / totalCredits;

    return {
      success: true,
      cgpa: parseFloat(cgpa.toFixed(2)),
      totalPoints,
      totalCredits,
      coursesCount: courses.length,
    };
  }

  async saveCalculation(params, user) {
    // In a real implementation, you would save this to a database
    // For now, we'll return a success response
    return {
      success: true,
      message: 'Calculation saved successfully',
      data: {
        cgpa: params.cgpa,
        semester: params.semester || 'N/A',
        savedAt: new Date().toISOString(),
        userId: user.id,
      },
    };
  }

  async getHistory(user, limit) {
    // In a real implementation, you would fetch from database
    // For now, we'll return an empty array
    return {
      success: true,
      history: [],
      limit,
      message: 'No calculation history found',
    };
  }
}

module.exports = CGPACalculatorController;

