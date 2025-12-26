/**
 * Migration script to fix Recording model indexes
 * Run this once to drop the old filename index and create the new filePath index
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function migrateIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully');

    const db = mongoose.connection.db;
    const collection = db.collection('recordings');

    // Get existing indexes
    console.log('\nCurrent indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(index => {
      console.log(`  - ${JSON.stringify(index.key)}: ${index.name}`);
    });

    // Drop the old filename_1 index if it exists
    try {
      console.log('\nDropping old filename_1 index...');
      await collection.dropIndex('filename_1');
      console.log('✓ Successfully dropped filename_1 index');
    } catch (error) {
      if (error.code === 27) {
        console.log('✓ Index filename_1 does not exist (already dropped or never created)');
      } else {
        throw error;
      }
    }

    // Create new filePath unique index
    try {
      console.log('\nCreating new unique index on filePath...');
      await collection.createIndex({ filePath: 1 }, { unique: true });
      console.log('✓ Successfully created unique index on filePath');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('✓ Index on filePath already exists');
      } else {
        throw error;
      }
    }

    // Show updated indexes
    console.log('\nUpdated indexes:');
    const updatedIndexes = await collection.indexes();
    updatedIndexes.forEach(index => {
      console.log(`  - ${JSON.stringify(index.key)}: ${index.name}`);
    });

    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

migrateIndexes();
