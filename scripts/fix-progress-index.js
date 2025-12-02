const mongoose = require('mongoose');
require('dotenv').config();

async function fixProgressIndex() {
  try {
    // Connect to MongoDB
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/eduwise'
    );
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    const db = mongoose.connection.db;
    const collection = db.collection('progressdatas');

    // List all indexes
    console.log('\nCurrent indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(index => {
      console.log(`  - ${index.name}:`, index.key);
    });

    // Drop the problematic userId_1 index if it exists
    try {
      await collection.dropIndex('userId_1');
      console.log('\n✅ Successfully dropped index: userId_1');
    } catch (error) {
      if (error.code === 27) {
        console.log('\nℹ️  Index userId_1 does not exist (already removed)');
      } else {
        throw error;
      }
    }

    // Verify indexes after fix
    console.log('\nIndexes after fix:');
    const indexesAfter = await collection.indexes();
    indexesAfter.forEach(index => {
      console.log(`  - ${index.name}:`, index.key);
    });

    console.log('\n✅ Index fix completed successfully!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing index:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

fixProgressIndex();

