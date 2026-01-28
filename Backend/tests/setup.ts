import { jest } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SECRET = 'test-jwt-secret-key-for-testing';

const shouldShowTestLogs =
  process.env.TEST_LOGS === '1' ||
  process.env.TEST_LOGS === 'true' ||
  process.env.TEST_LOGS === 'yes';

if (!shouldShowTestLogs) {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
}

let db: DatabaseSync;

export function getTestDb(): DatabaseSync {
  if (!db) {
    throw new Error('Test DB not initialized yet');
  }
  return db;
}

export function initializeSchema(db: DatabaseSync) {
  // Create all tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(254) UNIQUE NOT NULL,
      password VARCHAR(60)
    );

    CREATE TABLE IF NOT EXISTS pin (
      id INTEGER PRIMARY KEY,
      creatorID INTEGER,
      latitude REAL,
      longitude REAL,
      title VARCHAR(200),
      address VARCHAR(200),
      description VARCHAR(500),
      tags VARCHAR(200),
      image VARCHAR(2000),
      likes INTEGER DEFAULT 0,
      FOREIGN KEY (creatorID) REFERENCES account(id)
    );

    CREATE TABLE IF NOT EXISTS comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pinID INTEGER,
      accountID INTEGER,
      comment VARCHAR(280),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pinID) REFERENCES pin(id),
      FOREIGN KEY (accountID) REFERENCES account(id)
    );

    CREATE TABLE IF NOT EXISTS likes (
      pinID INTEGER,
      accountID INTEGER,
      PRIMARY KEY (pinID, accountID),
      FOREIGN KEY (pinID) REFERENCES pin(id),
      FOREIGN KEY (accountID) REFERENCES account(id)
    );

    CREATE TABLE IF NOT EXISTS post (
      id INTEGER PRIMARY KEY,
      creatorID INTEGER,
      title VARCHAR(100) NOT NULL,
      location VARCHAR(200) NOT NULL,
      category VARCHAR(20) DEFAULT 'New',
      tags VARCHAR(500),
      message TEXT NOT NULL,
      image VARCHAR(2000),
      upvotes INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creatorID) REFERENCES account(id)
    );

    CREATE TABLE IF NOT EXISTS itinerary (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function resetTestDb() {
  try {
    db.exec(`
      DELETE FROM likes;
      DELETE FROM comment;
      DELETE FROM pin;
      DELETE FROM post;
      DELETE FROM itinerary;
      DELETE FROM account;
    `);
  } catch (error) {
    // Ignore errors if tables don't exist
  }
}

export function closeTestDb() {
  // DatabaseSync is managed by the module, no need to close explicitly for now
}

// Clean up after all tests
afterAll(() => {
  closeTestDb();
});

beforeAll(async () => {
  // Delay importing the DB module until after the console mocks
  // are installed, so its module-level console output can be silenced.
  ({ db } = await import('../database/db'));
});

// Reset database before each test
beforeEach(() => {
  initializeSchema(db);
  resetTestDb();
});
