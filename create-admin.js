const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

async function createAdmin() {
  try {
    await mongoose.connect('mongodb://admin:admin@10.13.8.80:27017/videox?authSource=admin');
    console.log('Connected to MongoDB');

    const hash = await bcrypt.hash('admin123', 10);
    console.log('Password hash generated');

    const User = mongoose.model('User', new mongoose.Schema({
      username: String,
      password: String,
      role: String,
      active: Boolean,
      createdAt: Date,
      updatedAt: Date
    }));

    // Check if user already exists
    const existing = await User.findOne({ username: 'admin' });
    if (existing) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    const user = await User.create({
      username: 'admin',
      password: hash,
      role: 'admin',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('Admin user created successfully!');
    console.log('Username: admin');
    console.log('Password: admin123');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createAdmin();
