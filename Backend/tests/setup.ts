import { jest } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the production schema once so tests always run against the exact same
// table definitions, FK cascade rules, and indexes as production.
const CREATE_SQL = readFileSync(
  path.join(__dirname, '../database/create.sql'),
  'utf8'
);

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

// Drops and recreates all tables from the production schema. Running this
// before each test gives a fully clean slate: no leftover rows, correct FK
// cascade rules, and reset autoincrement sequences.
export function initializeSchema(database: DatabaseSync) {
  database.exec(CREATE_SQL);
}

afterAll(() => {
  // DatabaseSync is managed by the module; no explicit close needed.
});

beforeAll(async () => {
  // Delay importing the DB module until after console mocks are installed,
  // so its module-level console output can be silenced.
  ({ db } = await import('../database/db'));
});

// Drop and recreate all tables before each test for a fully clean slate.
beforeEach(() => {
  initializeSchema(db);
});
