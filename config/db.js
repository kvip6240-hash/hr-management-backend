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
    // Atlas (mongodb+srv) needs DNS SRV lookup + TLS handshake; 3s was too short for cold starts.
    const isLocal = /127\.0\.0\.1|localhost/.test(uri);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: isLocal ? 3000 : env.mongoServerSelectionTimeoutMS
    });
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

    // Never log the full URI (it contains the database password)
    logger.error(`MongoDB connection error: ${error.message}`);
    if (/bad auth|authentication failed/i.test(error.message)) {
      logger.error('Hint: check the Atlas database username/password in MONGODB_URI (URL-encode special characters like @ : / ? # in the password).');
    } else if (/ENOTFOUND|querySrv/i.test(error.message)) {
      logger.error('Hint: the cluster hostname in MONGODB_URI could not be resolved. Check the connection string.');
    } else if (/Server selection timed out|ECONNREFUSED|ETIMEDOUT|whitelist|IP/i.test(error.message)) {
      logger.error('Hint: make sure this server\'s IP is allowed in Atlas → Network Access (Render needs 0.0.0.0/0 or its static outbound IPs).');
    }
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
