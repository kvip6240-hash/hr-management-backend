const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const env = require('./env');
const logger = require('../utils/logger');

let localMongoServer = null;

// Connection event listeners for Atlas lifecycle events
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB connection lost. Reconnecting...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected successfully.');
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB runtime error: ${err.message}`, err);
});

const connectDB = async (customUri = null) => {
  const uri = customUri || process.env.MONGODB_URI || env.mongodbUri;
  
  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    logger.info(`MongoDB Connected successfully: Host=${conn.connection.host}, Database=${conn.connection.name}`);
    return conn;
  } catch (error) {
    const isLocalhost = uri.includes('127.0.0.1:27017') || uri.includes('localhost:27017');
    if (isLocalhost && !localMongoServer) {
      try {
        logger.info('No external MongoDB service found on port 27017. Starting embedded local MongoDB server with persistent storage...');
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const dataDir = path.resolve(__dirname, '../.mongo-data');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        localMongoServer = await MongoMemoryServer.create({
          instance: {
            port: 27017,
            dbPath: dataDir,
            storageEngine: 'wiredTiger'
          }
        });
        const conn = await mongoose.connect(uri);
        logger.info(`MongoDB Connected successfully via embedded server: Host=${conn.connection.host}, Database=${conn.connection.name}`);
        return conn;
      } catch (embeddedError) {
        logger.error(`Embedded MongoDB startup failed: ${embeddedError.message}`, embeddedError);
      }
    }

    logger.error(`MongoDB connection error: ${error.message}`, error);
    if (!customUri) {
      // Exit process with failure in normal server start if DB connection fails
      process.exit(1);
    }
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (localMongoServer) {
      await localMongoServer.stop();
      localMongoServer = null;
    }
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error(`Error disconnecting MongoDB: ${error.message}`);
  }
};

module.exports = {
  connectDB,
  disconnectDB
};
