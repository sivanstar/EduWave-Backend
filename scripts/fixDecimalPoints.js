/**
 * Migration script to fix existing decimal points in the database
 * Run this once to round all existing decimal points to whole numbers
 * 
 * Usage: node backend/scripts/fixDecimalPoints.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const User = require('../models/User');

async function fixDecimalPoints() {
  try {
    // Connect to database
    const dbUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!dbUri) {
      console.error('❌ MONGO_URI not found in environment variables');
      process.exit(1);
    }

    await mongoose.connect(dbUri);
    console.log('✅ Connected to database');

    // Find all users with decimal points
    const users = await User.find({});
    let fixedCount = 0;

    for (const user of users) {
      if (user.points !== undefined && user.points !== null) {
        const roundedPoints = Math.round(user.points);
        if (roundedPoints !== user.points) {
          console.log(`Fixing user ${user.email}: ${user.points} → ${roundedPoints}`);
          user.points = roundedPoints;
          await user.save();
          fixedCount++;
        }
      }
    }

    console.log(`\n✅ Migration complete! Fixed ${fixedCount} users with decimal points.`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing decimal points:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the migration
fixDecimalPoints();

