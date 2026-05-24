"""
Randomly assigns accounts 1-15 as creators for the 1,000 Wikidata pins
that currently have creatorID = NULL.

Run against the local dev DB by default. Pass --prod to target db_from_prod.
"""

import argparse
import random
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEV_DB    = REPO_ROOT / "Backend" / "database"     / "database.db"
PROD_DB   = REPO_ROOT / "Backend" / "db_from_prod" / "database.db"

MOCK_ACCOUNT_IDS = list(range(1, 16))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true",
                        help="Target db_from_prod/database.db instead of the dev DB")
    args = parser.parse_args()

    db_path = PROD_DB if args.prod else DEV_DB
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    # Confirm the mock accounts actually exist
    existing = {
        row[0] for row in cur.execute(
            f"SELECT id FROM account WHERE id IN ({','.join('?'*len(MOCK_ACCOUNT_IDS))})",
            MOCK_ACCOUNT_IDS,
        )
    }
    if not existing:
        raise SystemExit("No mock accounts (1-15) found in DB.")

    pin_ids = [
        row[0] for row in cur.execute("SELECT id FROM pin WHERE creatorID IS NULL")
    ]

    if not pin_ids:
        print("No pins with NULL creatorID — nothing to do.")
        conn.close()
        return

    print(f"Database : {db_path}")
    print(f"Pins to assign: {len(pin_ids)}")

    for pin_id in pin_ids:
        cur.execute(
            "UPDATE pin SET creatorID = ? WHERE id = ?",
            (random.choice(list(existing)), pin_id),
        )

    conn.commit()
    conn.close()
    print(f"Done — assigned {len(pin_ids)} pins to random accounts in 1-15.")


if __name__ == "__main__":
    main()
