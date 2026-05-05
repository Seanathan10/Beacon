import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isTest = process.env.NODE_ENV === "test";
const dbPath = isTest ? ":memory:" : path.join(__dirname, "database.db");

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON');

console.log(`Connected to SQLite database (${isTest ? "In-Memory" : "File"})`);

export function query(sql: string, params: any[] = []): any {
    const stmt = db.prepare(sql);
    const upperSql = sql.trim().toUpperCase();
    if (upperSql.startsWith("SELECT") || upperSql.includes("RETURNING")) {
        return stmt.all(...params);
    } else {
        return stmt.run(...params);
    }
}

function runMigrations() {
    try {
        const existingTables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).all() as { name: string }[];
        const tableNames = new Set(existingTables.map(t => t.name));

        // Add pin.createdAt if missing (backfill existing rows to ~30 days ago).
        if (tableNames.has('pin')) {
            const columns = db.prepare("PRAGMA table_info(pin)").all() as { name: string }[];
            const hasCreatedAt = columns.some(c => c.name === 'createdAt');
            if (!hasCreatedAt) {
                // SQLite disallows non-constant defaults on ALTER TABLE, so add the column
                // nullable, backfill, then rely on inserts to populate it via explicit defaults.
                db.exec(`ALTER TABLE pin ADD COLUMN createdAt DATETIME`);
                db.exec(`UPDATE pin SET createdAt = datetime('now', '-30 days') WHERE createdAt IS NULL`);
                console.log("Migrated: added pin.createdAt column with 30-day backfill");
            }
        }

        // Create pin_status table if missing
        db.exec(`
            CREATE TABLE IF NOT EXISTS pin_status (
                pinID INTEGER NOT NULL,
                accountID INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('visited','wishlist')),
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (pinID, accountID),
                FOREIGN KEY (pinID) REFERENCES pin(id) ON DELETE CASCADE,
                FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
            );
        `);

        // Create search_history table if missing
        db.exec(`
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                accountID INTEGER NOT NULL,
                query VARCHAR(200) NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
            );
        `);

        // Add profile columns to account if missing
        if (tableNames.has('account')) {
            const accountCols = db.prepare("PRAGMA table_info(account)").all() as { name: string }[];
            const accountColNames = new Set(accountCols.map(c => c.name));
            if (!accountColNames.has('bio')) {
                db.exec(`ALTER TABLE account ADD COLUMN bio VARCHAR(300)`);
                console.log("Migrated: added account.bio column");
            }
            if (!accountColNames.has('avatar')) {
                db.exec(`ALTER TABLE account ADD COLUMN avatar VARCHAR(2000)`);
                console.log("Migrated: added account.avatar column");
            }
            if (!accountColNames.has('profileVisibility')) {
                db.exec(`ALTER TABLE account ADD COLUMN profileVisibility TEXT DEFAULT 'public'`);
                console.log("Migrated: added account.profileVisibility column");
            }
        }

        // Create user_follow table if missing
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_follow (
                followerID INTEGER NOT NULL,
                followingID INTEGER NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (followerID, followingID),
                FOREIGN KEY (followerID) REFERENCES account(id) ON DELETE CASCADE,
                FOREIGN KEY (followingID) REFERENCES account(id) ON DELETE CASCADE,
                CHECK (followerID != followingID)
            );
        `);
    } catch (err) {
        console.error("Failed to run migrations:", err);
    }
}

function createIndexes() {
    try {
        // Create indexes on foreign keys and common query patterns
        // Only create indexes for tables that actually exist
        const indexStatements = [
            // Pin table indexes
            { table: 'pin', sql: 'CREATE INDEX IF NOT EXISTS idx_pin_creatorID ON pin(creatorID)' },
            { table: 'pin', sql: 'CREATE INDEX IF NOT EXISTS idx_pin_coordinates ON pin(latitude, longitude)' },
            // Comment table indexes
            { table: 'comment', sql: 'CREATE INDEX IF NOT EXISTS idx_comment_pinID ON comment(pinID)' },
            { table: 'comment', sql: 'CREATE INDEX IF NOT EXISTS idx_comment_accountID ON comment(accountID)' },
            // Likes table indexes
            { table: 'likes', sql: 'CREATE INDEX IF NOT EXISTS idx_likes_pinID ON likes(pinID)' },
            { table: 'likes', sql: 'CREATE INDEX IF NOT EXISTS idx_likes_accountID ON likes(accountID)' },
            // Post table indexes
            { table: 'post', sql: 'CREATE INDEX IF NOT EXISTS idx_post_creatorID ON post(creatorID)' },
            // Post upvote table indexes (only if table exists)
            { table: 'post_upvote', sql: 'CREATE INDEX IF NOT EXISTS idx_post_upvote_postID ON post_upvote(postID)' },
            { table: 'post_upvote', sql: 'CREATE INDEX IF NOT EXISTS idx_post_upvote_accountID ON post_upvote(accountID)' },
            // Account table indexes
            { table: 'account', sql: 'CREATE INDEX IF NOT EXISTS idx_account_email ON account(email)' },
            // Batch 2: trending + status + search history
            { table: 'pin', sql: 'CREATE INDEX IF NOT EXISTS idx_pin_createdAt ON pin(createdAt)' },
            { table: 'pin_status', sql: 'CREATE INDEX IF NOT EXISTS idx_pin_status_accountID ON pin_status(accountID)' },
            { table: 'search_history', sql: 'CREATE INDEX IF NOT EXISTS idx_search_history_user_time ON search_history(accountID, createdAt DESC)' },
            { table: 'user_follow', sql: 'CREATE INDEX IF NOT EXISTS idx_user_follow_follower ON user_follow(followerID)' },
            { table: 'user_follow', sql: 'CREATE INDEX IF NOT EXISTS idx_user_follow_following ON user_follow(followingID)' },
        ];

        // Get list of existing tables
        const existingTables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).all() as { name: string }[];
        const tableNames = new Set(existingTables.map(t => t.name));

        // Create indexes only for tables that exist
        for (const { table, sql } of indexStatements) {
            if (tableNames.has(table)) {
                try {
                    db.exec(sql);
                } catch (err) {
                    // If a specific index fails, log it but continue with others
                    console.warn(`Failed to create index on ${table}:`, err instanceof Error ? err.message : err);
                }
            }
        }
        console.log("Database indexes created/verified");
    } catch (err) {
        console.error("Failed to create indexes:", err);
    }
}

function initPostsTable() {
    db.exec(`
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
    `);

    const count = db.prepare("SELECT COUNT(*) as count FROM post").get() as { count: number };
    if (count.count === 0) {
        db.exec(`
            INSERT INTO post (creatorID, title, location, category, tags, message, image, upvotes) VALUES
                (NULL, 'Taco Bell', '1405 Mission St, Santa Cruz, CA', 'Hot', 'Food,Casual', 'Authentic Latinx cuisine, straight from the heart of Santa Cruz.', 'https://s3-media0.fl.yelpcdn.com/bphoto/xla2vDAWBz4b3y3d0iVHuw/348s.jpg', 10),
                (NULL, 'Matcha Labubu Cafe', '16th Ave, Santa Cruz, CA 95062', 'Trendy', 'Cafe,Boba,Dessert', 'A cute little cafe with amazing matcha desserts and boba drinks.', 'https://www.matchacafe-maiko.com/assets/img/store/store-ga-atlanta.jpg', 8),
                (NULL, 'Farmers Market', '700 Front Street, Santa Cruz, CA 95060', 'Local', 'Community,Fresh Produce', 'A small popup farmer''s market near Trader Joe''s.', 'https://californiagrown.org/wp-content/uploads/2022/07/Paprika-Studios-CAG-Ag-Tour-Felton-Market-9176-copy.jpg', 5);
        `);
        console.log("Posts table seeded with initial data");
    }
}

if (!isTest) {
    initPostsTable();
    runMigrations();
    createIndexes();
}
