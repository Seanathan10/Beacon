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
}
