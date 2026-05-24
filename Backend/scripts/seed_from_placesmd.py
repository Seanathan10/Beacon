import re
import sqlite3
from pathlib import Path

REPO_ROOT = Path("/root/Beacon")
PLACES_PATH = REPO_ROOT / "places.md"
DB_PATH = REPO_ROOT / "Backend" / "database" / "database.db"

LINE_RE = re.compile(
    r"^\d+\.\s+\*\*(?P<title>.+?)\*\*\s+—\s+(?P<address>.+?)\s+—\s+"
    r"\((?P<lat>-?\d+\.\d+),\s*(?P<lon>-?\d+\.\d+)\)\s+—\s+Source:\s+(?P<source>.+)$"
)


def main() -> None:
    if not PLACES_PATH.exists():
        raise SystemExit(f"places.md not found at {PLACES_PATH}")

    entries = []
    for line in PLACES_PATH.read_text(encoding="utf-8").splitlines():
        match = LINE_RE.match(line.strip())
        if not match:
            continue
        entries.append(
            {
                "title": match.group("title").strip(),
                "address": match.group("address").strip(),
                "lat": float(match.group("lat")),
                "lon": float(match.group("lon")),
                "source": match.group("source").strip(),
            }
        )

    if not entries:
        raise SystemExit("No entries found in places.md (expected numbered lines).")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    existing = {
        (row[0].lower(), round(row[1], 6), round(row[2], 6))
        for row in cur.execute("SELECT title, latitude, longitude FROM pin").fetchall()
        if row[0] is not None and row[1] is not None and row[2] is not None
    }

    insert_rows = []
    for entry in entries:
        key = (entry["title"].lower(), round(entry["lat"], 6), round(entry["lon"], 6))
        if key in existing:
            continue
        insert_rows.append(
            (
                None,
                entry["lat"],
                entry["lon"],
                entry["title"],
                entry["address"],
                f"Source: {entry['source']}",
                "Hidden Gem",
                None,
                0,
            )
        )

    cur.executemany(
        "INSERT INTO pin (creatorID, latitude, longitude, title, address, description, tags, image, likes) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        insert_rows,
    )
    conn.commit()
    conn.close()

    print(f"Inserted {len(insert_rows)} new pins from places.md")


if __name__ == "__main__":
    main()


