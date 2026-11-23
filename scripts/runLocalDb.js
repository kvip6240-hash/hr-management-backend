const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../.mongo-data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let mongod = null;

async function start() {
  console.log('[Mongo Service] Starting local MongoDB instance on port 27017 with persistent storage...');
  try {
    mongod = await MongoMemoryServer.create({
      instance: {
        port: 27017,
        dbPath: dataDir,
        storageEngine: 'wiredTiger'
      }
    });

    console.log(`[Mongo Service] MongoDB running successfully at: ${mongod.getUri()}`);
    console.log(`[Mongo Service] Database storage path: ${dataDir}`);
  } catch (error) {
    if (error.message && error.message.includes('Port 27017 is already in use')) {
      console.log('[Mongo Service] Port 27017 is already in use (MongoDB is already running).');
      process.exit(0);
    }
    console.error('[Mongo Service] Failed to start MongoDB:', error);
    process.exit(1);
  }

  const shutdown = async () => {
    console.log('[Mongo Service] Shutting down MongoDB...');
    if (mongod) {
      await mongod.stop();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();

