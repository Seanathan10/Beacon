import json
import os
import re
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path

# TOKEN = os.environ.get("LOCATIONIQ_TOKEN")
# if not TOKEN:
#     raise SystemExit("LOCATIONIQ_TOKEN is required")

TOKEN = "pk.3e7774f7efc0515c5e2556a8b8df11d7"

REPO_ROOT = Path("~/Beacon")
PLACES_PATH = REPO_ROOT / "places.md"
DB_PATH = REPO_ROOT / "Backend" / "database" / "database.db"

STATES = [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
]

INCLUDE_PARKS = False
BASE_INSTANCE_TYPES = [
    "Q570116",  # tourist attraction
    "Q33506",   # museum
    "Q158852",  # historical site
    "Q208910",  # natural monument
    "Q35509",   # cave
    "Q34038",   # waterfall
    "Q39715",   # lighthouse
    "Q740622",  # ghost town
    "Q11707",   # restaurant
    "Q174782",  # cafe
    "Q187456",  # bar
    "Q12323",   # National Historic Landmark
]
PARK_INSTANCE_TYPES = [
    "Q23993",   # state park
    "Q473972",  # protected area
    "Q46169",   # national park
    "Q839954",  # national monument
]
INSTANCE_TYPES = BASE_INSTANCE_TYPES + (PARK_INSTANCE_TYPES if INCLUDE_PARKS else [])

UA = "BeaconDataSeed/1.0 (contact: local)"
QUERY_TIMEOUTS = [20, 30, 45, 60]
STATE_QUERY_RETRIES = 3


def fetch_json(url: str, retries: int = 3, timeout: int = 20) -> dict:
    last_error = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(2 + attempt)
    raise last_error


def search_state_qid(state: str) -> str:
    query = urllib.parse.urlencode(
        {
            "action": "wbsearchentities",
            "search": state,
            "language": "en",
            "format": "json",
            "limit": 10,
        }
    )
    url = f"https://www.wikidata.org/w/api.php?{query}"
    data = fetch_json(url)
    results = data.get("search", [])
    if not results:
        raise ValueError(f"No Wikidata QID for state: {state}")
    for item in results:
        desc = (item.get("description") or "").lower()
        label = (item.get("label") or "").lower()
        if label == state.lower() and (
            "state of the united states" in desc or "u.s. state" in desc
        ):
            return item["id"]
    return results[0]["id"]


def wkt_to_lat_lon(wkt: str):
    match = re.search(r"Point\(([-0-9.]+)\s+([-0-9.]+)\)", wkt)
    if not match:
        return None
    lon = float(match.group(1))
    lat = float(match.group(2))
    return lat, lon


def query_places(state_qid: str, limit: int = 80) -> list[dict]:
    instances = " ".join(f"wd:{qid}" for qid in INSTANCE_TYPES)
    query = f"""
SELECT ?place ?placeLabel ?coord ?desc ?image WHERE {{
  VALUES ?instance {{ {instances} }}
  ?place wdt:P31/wdt:P279* ?instance;
         wdt:P131* wd:{state_qid};
         wdt:P625 ?coord.
  OPTIONAL {{ ?place schema:description ?desc FILTER (lang(?desc) = "en") }}
  OPTIONAL {{ ?place wdt:P18 ?image }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
LIMIT {limit}
"""
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
        {"format": "json", "query": query}
    )
    data = fetch_json(url)
    return data["results"]["bindings"]


def query_places_with_retry(state_qid: str, limit: int = 80) -> list[dict]:
    last_error = None
    for attempt in range(STATE_QUERY_RETRIES):
        timeout = QUERY_TIMEOUTS[min(attempt, len(QUERY_TIMEOUTS) - 1)]
        try:
            return fetch_json(
                "https://query.wikidata.org/sparql?"
                + urllib.parse.urlencode({"format": "json", "query": query_places_query(state_qid, limit)}),
                retries=2,
                timeout=timeout,
            )["results"]["bindings"]
        except Exception as exc:
            last_error = exc
            time.sleep(3 + attempt)
    raise last_error


def query_places_query(state_qid: str, limit: int) -> str:
    instances = " ".join(f"wd:{qid}" for qid in INSTANCE_TYPES)
    return f"""
SELECT ?place ?placeLabel ?coord ?desc ?image WHERE {{
  VALUES ?instance {{ {instances} }}
  ?place wdt:P31/wdt:P279* ?instance;
         wdt:P131* wd:{state_qid};
         wdt:P625 ?coord.
  OPTIONAL {{ ?place schema:description ?desc FILTER (lang(?desc) = "en") }}
  OPTIONAL {{ ?place wdt:P18 ?image }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
LIMIT {limit}
"""


def reverse_geocode(lat: float, lon: float) -> str:
    params = urllib.parse.urlencode(
        {
            "key": TOKEN,
            "lat": f"{lat:.6f}",
            "lon": f"{lon:.6f}",
            "format": "json",
        }
    )
    url = f"https://us1.locationiq.com/v1/reverse?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as response:
        data = json.load(response)
    return data.get("display_name") or ""


def reverse_geocode_with_retry(lat: float, lon: float, retries: int = 2) -> str:
    last_error = None
    for _ in range(retries + 1):
        try:
            return reverse_geocode(lat, lon)
        except Exception as exc:
            last_error = exc
            time.sleep(1.5)
    raise last_error


def main():
    places_by_state: dict[str, list[dict]] = {}

    for state in STATES:
        print(f"Querying Wikidata for {state}...")
        qid = search_state_qid(state)
        try:
            results = query_places_with_retry(qid, limit=80)
        except Exception as exc:
            print(f"  Failed to query {state}: {exc}")
            continue
        print(f"  Received {len(results)} candidates.")

        seen = set()
        places = []
        for item in results:
            name = item["placeLabel"]["value"].strip()
            if re.fullmatch(r"Q\\d+", name):
                continue
            if not name or name.lower() in seen:
                continue
            coords = wkt_to_lat_lon(item["coord"]["value"])
            if not coords:
                continue
            seen.add(name.lower())
            lat, lon = coords
            desc = item.get("desc", {}).get("value", "").strip()
            image = item.get("image", {}).get("value")
            image_url = None
            if image:
                filename = image.split("/")[-1]
                image_url = (
                    "https://commons.wikimedia.org/wiki/Special:FilePath/"
                    f"{urllib.parse.quote(filename)}?width=1600"
                )
            places.append(
                {
                    "state": state,
                    "name": name,
                    "lat": lat,
                    "lon": lon,
                    "description": desc,
                    "image": image_url,
                    "source": item["place"]["value"],
                }
            )
            if len(places) >= 20:
                break

        if len(places) < 15:
            print(f"  Warning: only found {len(places)} places for {state}.")
            continue

        print(f"  Reverse geocoding {len(places)} places...")
        for idx, place in enumerate(places, 1):
            print(f"    [{idx}/{len(places)}] {place['name']}")
            place["address"] = reverse_geocode_with_retry(place["lat"], place["lon"])
            time.sleep(0.55)  # ~2 req/sec limit

        places_by_state[state] = places

    print("Writing places.md (all states)...")
    lines = [
        "# Places (Hidden Gems by U.S. State)",
        "",
        "Sources: Wikidata protected areas/parks/landmarks with coordinates (linked per entry).",
        "Addresses are reverse-geocoded via LocationIQ for accuracy.",
        "",
    ]

    for state, entries in places_by_state.items():
        lines.append(f"## {state}")
        for idx, place in enumerate(entries, 1):
            coord = f"{place['lat']:.6f}, {place['lon']:.6f}"
            address = place["address"]
            lines.append(
                f"{idx}. **{place['name']}** — {address} — ({coord}) — Source: {place['source']}"
            )
        lines.append("")

    PLACES_PATH.write_text("\n".join(lines), encoding="utf-8")

    print("Inserting new pins into database...")
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()
    existing_titles = {
        row[0].lower()
        for row in cur.execute("SELECT title FROM pin").fetchall()
        if row[0]
    }

    insert_rows = []
    for entries in places_by_state.values():
        for place in entries:
            if place["name"].lower() in existing_titles:
                continue
            description = place["description"] or f"Protected area in {place['state']}."
            tags = "Hidden Gem,Tourist Attraction,Food & Drink"
            insert_rows.append(
                (
                    None,
                    place["lat"],
                    place["lon"],
                    place["name"],
                    place["address"],
                    description[:500],
                    tags,
                    place["image"],
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

    total_places = sum(len(v) for v in places_by_state.values())
    print(f"places.md written with {total_places} entries")
    print(f"Inserted {len(insert_rows)} new pins into database")


if __name__ == "__main__":

    REPO_ROOT = Path("~/Beacon")
    PLACES_PATH = REPO_ROOT / "places.md"
    DB_PATH = REPO_ROOT / "Backend" / "database" / "database.db"
    
    print("Inserting new pins into database...")
    conn = sqlite3.connect("/root/Beacon/Backend/database/database.db")
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()
    existing_titles = {
        row[0].lower()
        for row in cur.execute("SELECT title FROM pin").fetchall()
        if row[0]
    }

    insert_rows = []
    for entries in places_by_state.values():
        for place in entries:
            if place["name"].lower() in existing_titles:
                continue
            description = place["description"] or f"Protected area in {place['state']}."
            tags = "Hidden Gem,Tourist Attraction,Food & Drink"
            insert_rows.append(
                (
                    None,
                    place["lat"],
                    place["lon"],
                    place["name"],
                    place["address"],
                    description[:500],
                    tags,
                    place["image"],
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

    total_places = sum(len(v) for v in places_by_state.values())
    print(f"places.md written with {total_places} entries")
    print(f"Inserted {len(insert_rows)} new pins into database")

