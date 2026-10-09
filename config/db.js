const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;

    console.log('\n📡 Attempting to connect to MongoDB...');
    console.log(`   Database URI: ${mongoUri ? 'configured' : 'NOT SET'}`);

    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set in .env file');
    }

    const conn = await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ MongoDB Connected Successfully!`);
    console.log(`   Host: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
    console.log(`   State: ${conn.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);

    return conn;
  } catch (error) {
    console.error('\n❌ Database Connection Error:');
    console.error(`   Error: ${error.message}`);
    console.error(`\n📝 SOLUTION:`);
    console.error('   1. Check your .env file has MONGODB_URI set');
    console.error('   2. Ensure MongoDB is running (mongod)');
    console.error('   3. For local: mongodb://localhost:27017/musicrecommendation');
    console.error('   4. For Atlas: mongodb+srv://user:pass@cluster.mongodb.net/dbname');
    console.error('   5. Restart the server after fixing .env\n');

    throw error;
  }
};

module.exports = connectDB;
