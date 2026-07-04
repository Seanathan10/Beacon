import * as db from "../database/db";

/**
 * Data-access layer for the `bookmark` and `bookmark_folder` tables.
 */

/** All of a user's bookmarked pins (joined with pin + author), newest first. */
export function findBookmarks(userID: number): any[] {
    return db.query(`
        SELECT
            b.pinID, b.folderID, b.createdAt,
            p.creatorID, a.email, p.latitude, p.longitude,
            p.title, p.address, p.description, p.image, p.tags,
            p.createdAt as pinCreatedAt,
            (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
        FROM bookmark b
        JOIN pin p ON p.id = b.pinID
        JOIN account a ON a.id = p.creatorID
        WHERE b.accountID = ?
        ORDER BY b.createdAt DESC
    `, [userID]);
}

/** Insert a bookmark. Throws on UNIQUE (dup) / FOREIGN KEY (missing) constraints. */
export function addBookmark(pinID: number, userID: number, folderID: string | null): { changes: number } {
    return db.query("INSERT INTO bookmark (pinID, accountID, folderID) VALUES (?, ?, ?)", [pinID, userID, folderID]);
}

/** Remove a user's bookmark for a pin. */
export function deleteBookmark(pinID: number, userID: number): { changes: number } {
    return db.query("DELETE FROM bookmark WHERE pinID = ? AND accountID = ?", [pinID, userID]);
}

/** Reassign a user's bookmark to a different folder (or null). Throws on bad FK. */
export function updateBookmarkFolder(pinID: number, userID: number, folderID: string | null): { changes: number } {
    return db.query("UPDATE bookmark SET folderID = ? WHERE pinID = ? AND accountID = ?", [folderID, pinID, userID]);
}

// ── Folders ─────────────────────────────────────────────────────────────────

/** A user's folders with a pin count each, newest first. */
export function findFolders(userID: number): any[] {
    return db.query(`
        SELECT
            bf.id, bf.name, bf.isPublic, bf.createdAt,
            (SELECT COUNT(*) FROM bookmark WHERE folderID = bf.id) AS pinCount
        FROM bookmark_folder bf
        WHERE bf.accountID = ?
        ORDER BY bf.createdAt DESC
    `, [userID]);
}

/** Create a folder. */
export function insertFolder(id: string, userID: number, name: string, isPublic: number): { changes: number } {
    return db.query(
        "INSERT INTO bookmark_folder (id, accountID, name, isPublic) VALUES (?, ?, ?, ?)",
        [id, userID, name, isPublic],
    );
}

/** Owner row (`{ accountID }`) for a folder, or undefined when missing. */
export function findFolderOwner(id: string): { accountID: number } | undefined {
    return db.query("SELECT accountID FROM bookmark_folder WHERE id = ?", [id])[0];
}

/** Apply a partial update to a folder. Column names come from trusted callers. */
export function updateFolder(id: string, fields: Record<string, unknown>): { changes: number } {
    const keys = Object.keys(fields);
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    return db.query(`UPDATE bookmark_folder SET ${setClause} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
}

/** A folder by id regardless of owner (used to check public visibility), or undefined. */
export function findFolderById(id: string): any | undefined {
    return db.query("SELECT id, accountID, name, isPublic, createdAt FROM bookmark_folder WHERE id = ?", [id])[0];
}

/** All pins in a folder (joined with pin + author), newest first. */
export function findFolderPins(folderID: string): any[] {
    return db.query(`
        SELECT
            p.id, p.creatorID, a.email, p.latitude, p.longitude,
            p.title, p.address, p.description, p.image, p.tags, p.createdAt,
            (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
        FROM bookmark b
        JOIN pin p ON p.id = b.pinID
        JOIN account a ON a.id = p.creatorID
        WHERE b.folderID = ?
        ORDER BY b.createdAt DESC
    `, [folderID]);
}

/**
 * Delete a folder and move its bookmarks to uncategorised (folderID = NULL) in a
 * single transaction, so bookmarks are never orphaned. Returns the delete result.
 */
export function deleteFolderWithReassign(id: string, userID: number): { changes: number } {
    return db.transaction(() => {
        db.query("UPDATE bookmark SET folderID = NULL WHERE folderID = ?", [id]);
        return db.query("DELETE FROM bookmark_folder WHERE id = ? AND accountID = ?", [id, userID]);
    });
}
