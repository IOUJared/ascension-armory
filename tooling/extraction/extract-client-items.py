#!/usr/bin/env python3
"""Extract the complete Ascension item catalog from the user's installed MPQs.

The Ascension client provides custom Item.dbc and ItemAddon.dbc tables. This
script joins them by item ID and streams newline-delimited JSON suitable for the
Prisma bulk importer. It does not modify the game client.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import BinaryIO, Iterator, TextIO

try:
    import mpyq
except ImportError as error:
    raise SystemExit("mpyq is required; run this through `npm run extract:client-items -- ...`") from error


QUALITY = ("POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM")
SLOTS = {
    1: "HEAD", 2: "NECK", 3: "SHOULDERS", 5: "CHEST", 6: "WAIST", 7: "LEGS",
    8: "FEET", 9: "WRISTS", 10: "HANDS", 11: "FINGER_1", 12: "TRINKET_1",
    13: "MAIN_HAND", 14: "OFF_HAND", 15: "RANGED", 16: "BACK", 17: "MAIN_HAND",
    20: "CHEST", 21: "MAIN_HAND", 22: "OFF_HAND", 23: "OFF_HAND", 25: "RANGED",
    26: "RANGED", 28: "RANGED",
}
ARMOR_TYPES = {1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate"}


def pg_int(value: int, default: int = 0) -> int:
    """Translate DBC unsigned sentinel values into PostgreSQL-safe integers."""
    return value if value <= 2**31 - 1 else default


def dbc_records(data: bytes, expected_fields: int) -> tuple[list[tuple[int, ...]], bytes]:
    magic, rows, fields, record_size, string_size = struct.unpack_from("<4s4I", data, 0)
    if magic != b"WDBC" or fields != expected_fields or record_size != expected_fields * 4:
        raise ValueError(f"Unsupported DBC header: {magic!r}, {rows=}, {fields=}, {record_size=}")
    records = [struct.unpack_from(f"<{fields}I", data, 20 + index * record_size) for index in range(rows)]
    strings_at = 20 + rows * record_size
    return records, data[strings_at : strings_at + string_size]


def dbc_string(block: bytes, offset: int) -> str:
    if offset >= len(block):
        return ""
    end = block.find(b"\0", offset)
    if end < 0:
        end = len(block)
    return block[offset:end].decode("utf-8", "replace")


def read_mpq_file(archive: "mpyq.MPQArchive", name: str) -> bytes:
    data = archive.read_file(name)
    if data is None:
        raise FileNotFoundError(f"{name} was not found in {archive.filename}")
    return data


def catalog(data_dir: Path) -> Iterator[dict[str, object]]:
    archive_path = data_dir / "patch-M.MPQ"
    if not archive_path.is_file():
        raise FileNotFoundError(f"Ascension custom data archive not found: {archive_path}")
    archive = mpyq.MPQArchive(str(archive_path), listfile=False)
    item_data = read_mpq_file(archive, "DBFilesClient\\Item.dbc")
    addon_data = read_mpq_file(archive, "DBFilesClient\\ItemAddon.dbc")
    display_data = read_mpq_file(archive, "DBFilesClient\\ItemDisplayInfo.dbc")
    item_records, _ = dbc_records(item_data, 8)
    addon_records, strings = dbc_records(addon_data, 48)
    display_records, display_strings = dbc_records(display_data, 25)
    items = {record[0]: record for record in item_records}
    display_icons = {
        record[0]: dbc_string(display_strings, record[5]).lower()
        for record in display_records
        if dbc_string(display_strings, record[5])
    }

    for addon in addon_records:
        item_id = addon[1]
        item = items.get(item_id)
        if item is None:
            continue
        name = dbc_string(strings, addon[2]).strip()
        description = dbc_string(strings, addon[19]).strip()
        item_class, subclass, display_id, inventory_type = item[1], item[2], item[5], item[6]
        if subclass >= 2**31:
            subclass -= 2**32
        quality_value = addon[36]
        digest = hashlib.sha256(struct.pack("<8I", *item) + struct.pack("<48I", *addon)).hexdigest()
        yield {
            "id": str(item_id),
            "name": name or f"Unknown Item {item_id}",
            "quality": QUALITY[quality_value] if quality_value < len(QUALITY) else "COMMON",
            "itemLevel": pg_int(addon[47]),
            "requiredLevel": 1,
            "slot": SLOTS.get(inventory_type),
            "inventoryType": pg_int(inventory_type),
            "armorType": ARMOR_TYPES.get(subclass) if item_class == 4 else None,
            "armor": pg_int(addon[43]),
            "icon": display_icons.get(display_id),
            "sourceUrl": f"client-mpq://patch-M.MPQ/item/{item_id}",
            "sourceRealm": "ASCENSION_CLIENT_ALL_REALMS",
            "rawTooltipHtml": description,
            "rawPayload": {
                "source": "ascension-client-mpq",
                "item": {"class": item_class, "subclass": subclass, "soundOverride": item[3], "material": item[4], "displayId": display_id, "inventoryType": inventory_type, "sheath": item[7]},
                "addon": {"rowId": addon[0], "flags": addon[37], "ascensionPower": addon[38], "values": list(addon[39:47])},
            },
            "contentHash": digest,
        }


def output_stream(path: Path) -> TextIO:
    if path.suffix == ".gz":
        return gzip.open(path, "wt", encoding="utf-8")
    return path.open("w", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True, help="Path to ascension-live/Data")
    parser.add_argument("--output", type=Path, default=Path("ascension-items.ndjson.gz"))
    parser.add_argument("--icon-map-output", type=Path, help="Optional item-ID-to-icon TSV for refreshing an existing database")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    icon_destination = args.icon_map_output.open("w", encoding="utf-8") if args.icon_map_output else None
    with output_stream(args.output) as destination:
        for record in catalog(args.data_dir):
            destination.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            if icon_destination and record.get("icon"):
                icon_destination.write(f"{record['id']}\t{record['icon']}\n")
            count += 1
            if count % 50_000 == 0:
                print(f"extracted {count:,} items", file=sys.stderr)
    if icon_destination:
        icon_destination.close()
    print(json.dumps({"items": count, "output": str(args.output), "iconMap": str(args.icon_map_output) if args.icon_map_output else None}))


if __name__ == "__main__":
    main()
