/**
 * Test Application Factory
 * Uses the real Express app but with a test database connection
 */

import { Express } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { app } from '../../index';
import { db, query } from '../../database/db'; // Use the main db instance
import { initializeSchema } from '../setup';

/**
 * Create test Express application
 */
export function createTestApp(): Express {
  // Ensure schema is initialized
  initializeSchema(db);
  return app;
}

/**
 * Create a test user and return auth token
 */
export async function createTestUser(
  email = 'test@example.com',
  password = 'testpassword123',
  name = 'Test User'
): Promise<{ token: string; userId: number; email: string }> {
  // Ensure password hash function creates valid bcrypt hash that matches what the auth service expects
  // The actual auth service uses 10 rounds
  const hashedPassword = await bcrypt.hash(password, 10);

  query('INSERT INTO account (email, password, name) VALUES (?, ?, ?)', [
    email,
    hashedPassword,
    name,
  ]);

  const [{ id }] = query('SELECT last_insert_rowid() as id');

  const token = jwt.sign({ id }, process.env.SECRET as string, {
    expiresIn: '1h',
    algorithm: 'HS256',
  });

  return { token, userId: id, email };
}

/**
 * Create a test pin
 */
export function createTestPin(
  creatorId: number,
  overrides: Partial<{
    latitude: number;
    longitude: number;
    title: string;
    address: string;
    description: string;
    image: string;
    tags: string;
    likes: number;
  }> = {}
): number {
  const defaults = {
    latitude: 37.7749,
    longitude: -122.4194,
    title: 'Test Pin',
    address: '123 Test St',
    description: 'A test pin',
    image: 'https://example.com/image.jpg',
    tags: JSON.stringify(['test', 'sample']),
    likes: 0,
  };

  const pin = { ...defaults, ...overrides };

  query(
    `INSERT INTO pin (creatorID, latitude, longitude, title, address, description, image, tags, likes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      creatorId,
      pin.latitude,
      pin.longitude,
      pin.title,
      pin.address,
      pin.description,
      pin.image,
      pin.tags,
      pin.likes,
    ]
  );

  const [{ id }] = query('SELECT last_insert_rowid() as id');
  return id;
}

/**
 * Create a test comment
 */
export function createTestComment(pinId: number, accountId: number, commentText: string): number {
  query(
    `INSERT INTO comment (pinID, accountID, comment, createdAt)
     VALUES (?, ?, ?, datetime('now'))`,
    [pinId, accountId, commentText]
  );

  const [{ id }] = query('SELECT last_insert_rowid() as id');
  return id;
}

/**
 * Create a test post
 */
export function createTestPost(
  creatorId: number | null,
  overrides: Partial<{
    title: string;
    location: string;
    category: string;
    tags: string;
    message: string;
    image: string;
    upvotes: number;
  }> = {}
): number {
  const defaults = {
    title: 'Test Post',
    location: 'Test Location',
    category: 'New',
    tags: 'test,sample',
    message: 'This is a test post',
    image: null as string | null,
    upvotes: 0,
  };

  const post = { ...defaults, ...overrides };

  query(
    `INSERT INTO post (creatorID, title, location, category, tags, message, image, upvotes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      creatorId,
      post.title,
      post.location,
      post.category,
      post.tags,
      post.message,
      post.image,
      post.upvotes,
    ]
  );

  const [{ id }] = query('SELECT last_insert_rowid() as id');
  return id;
}
