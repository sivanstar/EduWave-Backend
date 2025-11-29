const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
  premiumEnabled: {
    type: Boolean,
    default: true,
  },
  trialDuration: {
    type: Number,
    default: 60, // days
  },
  courseLimitFree: {
    type: Number,
    default: 2, // courses per month for free users
  },
  courseLimit: {
    type: Number,
    default: 2, // backward compatibility
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Singleton pattern - only one settings document
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);

