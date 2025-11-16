const mongoose = require('mongoose');
const connectDB = async () => {
  try {
    const dbNameOpt = process.env.MONGO_DB_NAME || 'paperly';
    // Removed deprecated options: useNewUrlParser and useUnifiedTopology
    // These are now the default behavior in Mongoose 6+
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: dbNameOpt
    });
    const dbName = mongoose.connection?.name;
    console.log(`MongoDB connected${dbName ? ` (db: ${dbName})` : ''}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};
module.exports = connectDB;
