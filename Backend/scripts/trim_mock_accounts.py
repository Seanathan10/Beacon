"""
Reduces mock/seed accounts from 54 down to 15.
- Reassigns pins and comments from accounts 16-54 to a random account in 1-15
- Deletes accounts 16-54 (cascades to any remaining rows in child tables)

Run against the local dev DB by default. Pass --prod to target db_from_prod.
"""

import argparse
import random
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEV_DB    = REPO_ROOT / "Backend" / "database"          / "database.db"
PROD_DB   = REPO_ROOT / "Backend" / "latest_db_from_prod" / "database.db"

KEEP_IDS  = list(range(1, 16))   # accounts 1–15
REMOVE_IDS = list(range(16, 55)) # accounts 16–54


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true",
                        help="Target latest_db_from_prod/database.db instead of the dev DB")
    args = parser.parse_args()

    db_path = PROD_DB if args.prod else DEV_DB
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")

    # Verify the accounts we plan to keep actually exist
    existing_keep = {
        row[0] for row in conn.execute(
            f"SELECT id FROM account WHERE id IN ({','.join('?'*len(KEEP_IDS))})",
            KEEP_IDS,
        )
    }
    if not existing_keep:
        raise SystemExit("No keep-accounts (1–15) found in DB — nothing to do.")

    keep_ids = sorted(existing_keep)

    # Count what will be reassigned
    placeholders = ",".join("?" * len(REMOVE_IDS))
    pin_count = conn.execute(
        f"SELECT COUNT(*) FROM pin WHERE creatorID IN ({placeholders})", REMOVE_IDS
    ).fetchone()[0]
    comment_count = conn.execute(
        f"SELECT COUNT(*) FROM comment WHERE accountID IN ({placeholders})", REMOVE_IDS
    ).fetchone()[0]

    print(f"Database : {db_path}")
    print(f"Keeping  : accounts {keep_ids[0]}–{keep_ids[-1]} ({len(keep_ids)} accounts)")
    print(f"Removing : accounts 16–54 ({len(REMOVE_IDS)} accounts)")
    print(f"Pins to reassign    : {pin_count}")
    print(f"Comments to reassign: {comment_count}")
    print()

    cur = conn.cursor()

    # Reassign each pin individually to a random keep-account
    pin_ids = [
        row[0] for row in cur.execute(
            f"SELECT id FROM pin WHERE creatorID IN ({placeholders})", REMOVE_IDS
        )
    ]
    for pin_id in pin_ids:
        new_owner = random.choice(keep_ids)
        cur.execute("UPDATE pin SET creatorID = ? WHERE id = ?", (new_owner, pin_id))

    # Reassign each comment individually to a random keep-account
    comment_ids = [
        row[0] for row in cur.execute(
            f"SELECT id FROM comment WHERE accountID IN ({placeholders})", REMOVE_IDS
        )
    ]
    for comment_id in comment_ids:
        new_owner = random.choice(keep_ids)
        cur.execute("UPDATE comment SET accountID = ? WHERE id = ?", (new_owner, comment_id))

    # Delete accounts 16-54; CASCADE handles any remaining child rows
    cur.execute(f"DELETE FROM account WHERE id IN ({placeholders})", REMOVE_IDS)
    deleted = cur.rowcount

    conn.commit()
    conn.close()

    print(f"Reassigned {len(pin_ids)} pins and {len(comment_ids)} comments to random accounts in 1–15.")
    print(f"Deleted {deleted} accounts.")


if __name__ == "__main__":
    main()
