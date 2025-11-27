/**
 * Tool Registry
 * Maps tool IDs to their respective controllers
 */

const CGPACalculatorController = require('../controllers/tools/cgpaCalculatorController');
const ProgressAnalyticsController = require('../controllers/tools/progressAnalyticsController');
const StudyPlannerController = require('../controllers/tools/studyPlannerController');
const TextToPdfController = require('../controllers/tools/textToPdfController');
const PdfToLinkController = require('../controllers/tools/pdfToLinkController');
const CourseCreatorController = require('../controllers/tools/courseCreatorController');

// Registry mapping tool IDs to controller classes
const toolRegistry = {
  'cgpa-calculator': CGPACalculatorController,
  'progress-analytics': ProgressAnalyticsController,
  'study-planner': StudyPlannerController,
  'text-to-pdf': TextToPdfController,
  'pdf-to-link': PdfToLinkController,
  'course-creator': CourseCreatorController,
  // Add more tools here as they are implemented
};

/**
 * Get controller instance for a tool
 * @param {String} toolId - The tool ID
 * @returns {BaseToolController|null} Controller instance or null if not found
 */
function getToolController(toolId) {
  const ControllerClass = toolRegistry[toolId];
  
  if (!ControllerClass) {
    return null;
  }

  return new ControllerClass();
}

/**
 * Check if a tool has a registered controller
 * @param {String} toolId - The tool ID
 * @returns {Boolean}
 */
function hasToolController(toolId) {
  return toolId in toolRegistry;
}

/**
 * Get all registered tool IDs
 * @returns {Array<String>}
 */
function getRegisteredToolIds() {
  return Object.keys(toolRegistry);
}

/**
 * Register a new tool controller
 * @param {String} toolId - The tool ID
 * @param {Class} ControllerClass - The controller class
 */
function registerTool(toolId, ControllerClass) {
  toolRegistry[toolId] = ControllerClass;
}

module.exports = {
  getToolController,
  hasToolController,
  getRegisteredToolIds,
  registerTool,
  toolRegistry,
};

