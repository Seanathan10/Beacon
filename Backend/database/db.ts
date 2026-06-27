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

/**
 * Run `fn` inside a single SQLite transaction. Commits if it returns,
 * rolls back and rethrows if it throws. Use for multi-statement writes that
 * must stay consistent (e.g. an insert plus a denormalized counter update).
 */
export function transaction<T>(fn: () => T): T {
    db.exec("BEGIN");
    try {
        const result = fn();
        db.exec("COMMIT");
        return result;
    } catch (err) {
        db.exec("ROLLBACK");
        throw err;
    }
}

function initPostsTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS post (
            id INTEGER PRIMARY KEY,
            creatorID INTEGER,
            title VARCHAR(100) NOT NULL,
            location VARCHAR(200) NOT NULL,
            latitude REAL,
            longitude REAL,
            category VARCHAR(20) DEFAULT 'New',
            tags VARCHAR(500),
            message TEXT NOT NULL,
            image VARCHAR(2000),
            upvotes INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creatorID) REFERENCES account(id) ON DELETE CASCADE
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

function runMigrations() {
    try {
        const existingTables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).all() as { name: string }[];
        const tableNames = new Set(existingTables.map(t => t.name));

        // ── Legacy migrations (backward compat) ──────────────────────────────

        if (tableNames.has('pin')) {
            const columns = db.prepare("PRAGMA table_info(pin)").all() as { name: string }[];
            if (!columns.some(c => c.name === 'createdAt')) {
                db.exec(`ALTER TABLE pin ADD COLUMN createdAt DATETIME`);
                console.log("Migrated: added pin.createdAt");
            }
            // Backfill any pins with NULL createdAt (e.g. seeded before the column had a default)
            const nullCount = (db.prepare("SELECT COUNT(*) as n FROM pin WHERE createdAt IS NULL").get() as { n: number }).n;
            if (nullCount > 0) {
                db.exec(`UPDATE pin SET createdAt = datetime('now', '-30 days') WHERE createdAt IS NULL`);
                console.log(`Migrated: backfilled createdAt for ${nullCount} pins`);
            }
        }

        if (tableNames.has('account')) {
            const accountCols = db.prepare("PRAGMA table_info(account)").all() as { name: string }[];
            const accountColNames = new Set(accountCols.map(c => c.name));
            if (!accountColNames.has('bio')) {
                db.exec(`ALTER TABLE account ADD COLUMN bio VARCHAR(300)`);
                console.log("Migrated: added account.bio");
            }
            if (!accountColNames.has('avatar')) {
                db.exec(`ALTER TABLE account ADD COLUMN avatar VARCHAR(2000)`);
                console.log("Migrated: added account.avatar");
            }
            if (!accountColNames.has('profileVisibility')) {
                db.exec(`ALTER TABLE account ADD COLUMN profileVisibility TEXT DEFAULT 'public'`);
                console.log("Migrated: added account.profileVisibility");
            }
        }

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

        db.exec(`
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                accountID INTEGER NOT NULL,
                query VARCHAR(200) NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
            );
        `);

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

        // ── Fix account: VARCHAR sizes + CHECK constraint ─────────────────────
        // prod DB was created with VARCHAR(20) for name/email/password and no CHECK
        if (tableNames.has('account')) {
            const { sql } = db.prepare(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='account'"
            ).get() as { sql: string };
            if (sql.includes("VARCHAR(20)") || !sql.includes("CHECK")) {
                db.exec(`PRAGMA foreign_keys = OFF`);
                db.exec(`
                    CREATE TABLE account_new (
                        id INTEGER PRIMARY KEY,
                        name VARCHAR(100),
                        email VARCHAR(254) UNIQUE NOT NULL,
                        password VARCHAR(60),
                        bio VARCHAR(300),
                        avatar VARCHAR(2000),
                        profileVisibility TEXT DEFAULT 'public' CHECK(profileVisibility IN ('public','friends','private'))
                    );
                    INSERT INTO account_new
                        SELECT id, name, email, password, bio, avatar, profileVisibility FROM account;
                    DROP TABLE account;
                    ALTER TABLE account_new RENAME TO account;
                `);
                db.exec(`PRAGMA foreign_keys = ON`);
                console.log("Migrated: fixed account table (VARCHAR sizes + CHECK constraint)");
            }
        }

        // ── Fix likes: add PRIMARY KEY + ON DELETE CASCADE ───────────────────
        // prod DB was missing the PRIMARY KEY, allowing duplicate likes
        if (tableNames.has('likes')) {
            const likesCols = db.prepare("PRAGMA table_info(likes)").all() as any[];
            if (!likesCols.some((c: any) => c.pk > 0)) {
                db.exec(`PRAGMA foreign_keys = OFF`);
                db.exec(`
                    CREATE TABLE likes_new (
                        pinID INTEGER,
                        accountID INTEGER,
                        PRIMARY KEY (pinID, accountID),
                        FOREIGN KEY (pinID) REFERENCES pin(id) ON DELETE CASCADE,
                        FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
                    );
                    INSERT OR IGNORE INTO likes_new SELECT DISTINCT pinID, accountID FROM likes;
                    DROP TABLE likes;
                    ALTER TABLE likes_new RENAME TO likes;
                `);
                db.exec(`PRAGMA foreign_keys = ON`);
                console.log("Migrated: fixed likes table with PRIMARY KEY and ON DELETE CASCADE");
            }
        }

        // ── Fix pin: ON DELETE CASCADE on FK ─────────────────────────────────
        if (tableNames.has('pin')) {
            const { sql } = db.prepare(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='pin'"
            ).get() as { sql: string };
            if (!sql.includes("ON DELETE CASCADE")) {
                db.exec(`PRAGMA foreign_keys = OFF`);
                db.exec(`
                    CREATE TABLE pin_new (
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
                        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (creatorID) REFERENCES account(id) ON DELETE CASCADE
                    );
                    INSERT INTO pin_new SELECT * FROM pin;
                    DROP TABLE pin;
                    ALTER TABLE pin_new RENAME TO pin;
                `);
                db.exec(`PRAGMA foreign_keys = ON`);
                console.log("Migrated: fixed pin table with ON DELETE CASCADE");
            }
        }

        // ── Fix comment: ON DELETE CASCADE on FKs ────────────────────────────
        if (tableNames.has('comment')) {
            const { sql } = db.prepare(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='comment'"
            ).get() as { sql: string };
            if (!sql.includes("ON DELETE CASCADE")) {
                db.exec(`PRAGMA foreign_keys = OFF`);
                db.exec(`
                    CREATE TABLE comment_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        pinID INTEGER,
                        accountID INTEGER,
                        comment VARCHAR(280),
                        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (pinID) REFERENCES pin(id) ON DELETE CASCADE,
                        FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
                    );
                    INSERT INTO comment_new SELECT * FROM comment;
                    DROP TABLE comment;
                    ALTER TABLE comment_new RENAME TO comment;
                    UPDATE sqlite_sequence SET name='comment' WHERE name='comment_new';
                `);
                db.exec(`PRAGMA foreign_keys = ON`);
                console.log("Migrated: fixed comment table with ON DELETE CASCADE");
            }
        }

        // ── Fix post: ON DELETE CASCADE + latitude/longitude columns ─────────
        if (tableNames.has('post')) {
            const { sql } = db.prepare(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='post'"
            ).get() as { sql: string };
            const postCols = db.prepare("PRAGMA table_info(post)").all() as any[];
            const postColNames = new Set(postCols.map((c: any) => c.name));
            const needsCascade = !sql.includes("ON DELETE CASCADE");
            const needsLatLng = !postColNames.has('latitude') || !postColNames.has('longitude');

            if (needsCascade) {
                // Recreate table; bake in lat/lng regardless so schema is always correct
                db.exec(`PRAGMA foreign_keys = OFF`);
                db.exec(`
                    CREATE TABLE post_new (
                        id INTEGER PRIMARY KEY,
                        creatorID INTEGER,
                        title VARCHAR(100) NOT NULL,
                        location VARCHAR(200) NOT NULL,
                        latitude REAL,
                        longitude REAL,
                        category VARCHAR(20) DEFAULT 'New',
                        tags VARCHAR(500),
                        message TEXT NOT NULL,
                        image VARCHAR(2000),
                        upvotes INTEGER DEFAULT 0,
                        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (creatorID) REFERENCES account(id) ON DELETE CASCADE
                    );
                `);
                if (needsLatLng) {
                    db.exec(`
                        INSERT INTO post_new (id, creatorID, title, location, category, tags, message, image, upvotes, createdAt)
                            SELECT id, creatorID, title, location, category, tags, message, image, upvotes, createdAt FROM post;
                    `);
                } else {
                    db.exec(`INSERT INTO post_new SELECT * FROM post;`);
                }
                db.exec(`
                    DROP TABLE post;
                    ALTER TABLE post_new RENAME TO post;
                `);
                db.exec(`PRAGMA foreign_keys = ON`);
                console.log("Migrated: fixed post table (ON DELETE CASCADE + lat/lng columns)");
            } else if (needsLatLng) {
                if (!postColNames.has('latitude'))  db.exec(`ALTER TABLE post ADD COLUMN latitude REAL`);
                if (!postColNames.has('longitude')) db.exec(`ALTER TABLE post ADD COLUMN longitude REAL`);
                console.log("Migrated: added post.latitude and post.longitude");
            }
        }

        // ── Add tables missing from prod ──────────────────────────────────────

        db.exec(`
            CREATE TABLE IF NOT EXISTS post_upvote (
                postID INTEGER,
                accountID INTEGER,
                PRIMARY KEY (postID, accountID),
                FOREIGN KEY (postID) REFERENCES post(id) ON DELETE CASCADE,
                FOREIGN KEY (accountID) REFERENCES account(id)
            );
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS itinerary (
                id TEXT PRIMARY KEY,
                creatorID INTEGER,
                data TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creatorID) REFERENCES account(id) ON DELETE CASCADE
            );
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS bookmark_folder (
                id TEXT PRIMARY KEY,
                accountID INTEGER NOT NULL,
                name VARCHAR(80) NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                isPublic INTEGER DEFAULT 0,
                FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
            );
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS bookmark (
                pinID INTEGER NOT NULL,
                accountID INTEGER NOT NULL,
                folderID TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (pinID, accountID),
                FOREIGN KEY (pinID) REFERENCES pin(id) ON DELETE CASCADE,
                FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE,
                FOREIGN KEY (folderID) REFERENCES bookmark_folder(id) ON DELETE SET NULL
            );
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS comment_reaction (
                commentID INTEGER NOT NULL,
                accountID INTEGER NOT NULL,
                emoji VARCHAR(8) NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (commentID, accountID, emoji),
                FOREIGN KEY (commentID) REFERENCES comment(id) ON DELETE CASCADE,
                FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
            );
        `);

    } catch (err) {
        console.error("Failed to run migrations:", err);
    }
}

function createIndexes() {
    try {
        const indexStatements = [
            { table: 'pin',              sql: 'CREATE INDEX IF NOT EXISTS idx_pin_creatorID ON pin(creatorID)' },
            { table: 'pin',              sql: 'CREATE INDEX IF NOT EXISTS idx_pin_createdAt ON pin(createdAt)' },
            { table: 'pin',              sql: 'CREATE INDEX IF NOT EXISTS idx_pin_coordinates ON pin(latitude, longitude)' },
            { table: 'comment',          sql: 'CREATE INDEX IF NOT EXISTS idx_comment_pinID ON comment(pinID)' },
            { table: 'comment',          sql: 'CREATE INDEX IF NOT EXISTS idx_comment_accountID ON comment(accountID)' },
            { table: 'likes',            sql: 'CREATE INDEX IF NOT EXISTS idx_likes_pinID ON likes(pinID)' },
            { table: 'likes',            sql: 'CREATE INDEX IF NOT EXISTS idx_likes_accountID ON likes(accountID)' },
            { table: 'post',             sql: 'CREATE INDEX IF NOT EXISTS idx_post_creatorID ON post(creatorID)' },
            { table: 'post',             sql: 'CREATE INDEX IF NOT EXISTS idx_post_coords ON post(latitude, longitude)' },
            { table: 'post_upvote',      sql: 'CREATE INDEX IF NOT EXISTS idx_post_upvote_postID ON post_upvote(postID)' },
            { table: 'post_upvote',      sql: 'CREATE INDEX IF NOT EXISTS idx_post_upvote_accountID ON post_upvote(accountID)' },
            { table: 'account',          sql: 'CREATE INDEX IF NOT EXISTS idx_account_email ON account(email)' },
            { table: 'pin_status',       sql: 'CREATE INDEX IF NOT EXISTS idx_pin_status_accountID ON pin_status(accountID)' },
            { table: 'search_history',   sql: 'CREATE INDEX IF NOT EXISTS idx_search_history_user_time ON search_history(accountID, createdAt DESC)' },
            { table: 'user_follow',      sql: 'CREATE INDEX IF NOT EXISTS idx_user_follow_follower ON user_follow(followerID)' },
            { table: 'user_follow',      sql: 'CREATE INDEX IF NOT EXISTS idx_user_follow_following ON user_follow(followingID)' },
            { table: 'bookmark_folder',  sql: 'CREATE INDEX IF NOT EXISTS idx_bookmark_folder_user ON bookmark_folder(accountID, createdAt DESC)' },
            { table: 'bookmark_folder',  sql: 'CREATE INDEX IF NOT EXISTS idx_bookmark_folder_public ON bookmark_folder(isPublic)' },
            { table: 'bookmark',         sql: 'CREATE INDEX IF NOT EXISTS idx_bookmark_user_folder ON bookmark(accountID, folderID, createdAt DESC)' },
            { table: 'comment_reaction', sql: 'CREATE INDEX IF NOT EXISTS idx_comment_reaction_comment ON comment_reaction(commentID)' },
            { table: 'comment_reaction', sql: 'CREATE INDEX IF NOT EXISTS idx_comment_reaction_account ON comment_reaction(accountID)' },
        ];

        const existingTables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).all() as { name: string }[];
        const tableNames = new Set(existingTables.map(t => t.name));

        for (const { table, sql } of indexStatements) {
            if (tableNames.has(table)) {
                try {
                    db.exec(sql);
                } catch (err) {
                    console.warn(`Failed to create index on ${table}:`, err instanceof Error ? err.message : err);
                }
            }
        }
        console.log("Database indexes created/verified");
    } catch (err) {
        console.error("Failed to create indexes:", err);
    }
}

if (!isTest) {
    initPostsTable();
    runMigrations();
    createIndexes();
}
