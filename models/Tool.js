const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Tool ID is required'],
    unique: true,
    trim: true,
  },
  name: {
    type: String,
    required: [true, 'Tool name is required'],
    trim: true,
  },
  icon: {
    type: String,
    required: [true, 'Tool icon is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Tool description is required'],
    trim: true,
  },
  category: {
    type: String,
    required: [true, 'Tool category is required'],
    trim: true,
    enum: ['Analytics', 'Planning', 'Academic', 'Document', 'File Sharing'],
  },
  status: {
    type: String,
    required: [true, 'Tool status is required'],
    enum: ['available', 'coming-soon'],
    default: 'available',
  },
  url: {
    type: String,
    required: [true, 'Tool URL is required'],
    trim: true,
  },
  features: [{
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    requiresAuth: {
      type: Boolean,
      default: false,
    },
    requiresPremium: {
      type: Boolean,
      default: false,
    },
    parameters: [{
      name: String,
      type: String, // 'string', 'number', 'boolean', 'array', 'object'
      required: Boolean,
      description: String,
    }],
  }],
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  handler: {
    type: String,
    trim: true,
    // Points to the controller module name (e.g., 'cgpaCalculatorController')
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
toolSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Tool', toolSchema);

