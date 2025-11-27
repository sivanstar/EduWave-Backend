const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/database');
const User = require('../models/User');

async function migrateUserRoles() {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to database');

    // Update all users without a role to have 'user' role
    const result = await User.updateMany(
      { role: { $exists: false } },
      { $set: { role: 'user' } }
    );

    console.log(`✓ Updated ${result.modifiedCount} users with default 'user' role`);

    // Display current role distribution
    const roleStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('\n📊 Current role distribution:');
    roleStats.forEach(stat => {
      console.log(`  - ${stat._id || 'no role'}: ${stat.count} users`);
    });

    console.log('\n✅ User roles migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error migrating user roles:', error);
    process.exit(1);
  }
}

// Run the migration function
migrateUserRoles();

