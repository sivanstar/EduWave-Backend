const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/database');
const User = require('../models/User');

// Get command line arguments
const args = process.argv.slice(2);
const email = args[0];
const role = args[1];

if (!email || !role) {
  console.error('❌ Usage: node scripts/setUserRole.js <email> <role>');
  console.error('   Roles: user, instructor, admin');
  process.exit(1);
}

if (!['user', 'instructor', 'admin'].includes(role)) {
  console.error('❌ Invalid role. Must be one of: user, instructor, admin');
  process.exit(1);
}

async function setUserRole() {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to database');

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`❌ User with email "${email}" not found`);
      process.exit(1);
    }

    // Update user role
    user.role = role;
    await user.save();

    console.log(`✅ Successfully updated user "${user.fullName}" (${user.email}) role to "${role}"`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting user role:', error);
    process.exit(1);
  }
}

// Run the function
setUserRole();

