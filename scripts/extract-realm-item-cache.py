#!/usr/bin/env python3
"""Extract authoritative item data from a WoW 3.3.5 realm item cache.

The server writes successful SMSG_ITEM_QUERY_SINGLE_RESPONSE payloads to
itemcache.wdb. Unlike the client DBC index, these records contain the values
actually returned by the selected realm: names, requirements, stats, armor,
weapon damage, sockets, and spell references.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Iterator, TextIO


QUALITY = ("POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM")
SLOTS = {
    1: "HEAD", 2: "NECK", 3: "SHOULDERS", 5: "CHEST", 6: "WAIST", 7: "LEGS",
    8: "FEET", 9: "WRISTS", 10: "HANDS", 11: "FINGER_1", 12: "TRINKET_1",
    13: "MAIN_HAND", 14: "OFF_HAND", 15: "RANGED", 16: "BACK", 17: "MAIN_HAND",
    20: "CHEST", 21: "MAIN_HAND", 22: "OFF_HAND", 23: "OFF_HAND", 25: "RANGED",
    26: "RANGED", 28: "RANGED",
}
ARMOR_TYPES = {1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate", 6: "Shield"}
STAT_KEYS = {
    0: "mana", 1: "health", 3: "agility", 4: "strength", 5: "intellect",
    6: "spirit", 7: "stamina", 12: "defense_rating", 13: "dodge_rating",
    14: "parry_rating", 15: "block_rating", 16: "hit_rating",
    17: "hit_rating", 18: "hit_rating", 19: "crit_rating",
    20: "crit_rating", 21: "crit_rating", 28: "haste_rating",
    29: "haste_rating", 30: "haste_rating", 31: "hit_rating",
    32: "crit_rating", 35: "resilience_rating", 36: "haste_rating",
    37: "expertise_rating",
    38: "attack_power", 39: "attack_power", 41: "healing_power",
    42: "spell_power", 43: "mp5", 44: "armor_penetration",
    45: "spell_power", 46: "hp5", 47: "spell_penetration", 48: "block_value",
}
SOCKET_COLORS = {1: "META", 2: "RED", 4: "YELLOW", 8: "BLUE"}


class Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.offset = 0

    def unpack(self, pattern: str):
        size = struct.calcsize("<" + pattern)
        if self.offset + size > len(self.data):
            raise ValueError(f"record ended at {self.offset}; need {size} more bytes")
        values = struct.unpack_from("<" + pattern, self.data, self.offset)
        self.offset += size
        return values[0] if len(values) == 1 else values

    def uint32(self) -> int:
        return self.unpack("I")

    def int32(self) -> int:
        return self.unpack("i")

    def float32(self) -> float:
        return self.unpack("f")

    def cstring(self) -> str:
        end = self.data.find(b"\0", self.offset)
        if end < 0:
            raise ValueError(f"unterminated string at {self.offset}")
        value = self.data[self.offset:end].decode("utf-8", "replace")
        self.offset = end + 1
        return value


def parse_payload(item_id: int, payload: bytes) -> dict[str, object]:
    reader = Reader(payload)
    item_class = reader.uint32()
    subclass = reader.uint32()
    sound_override = reader.int32()
    names = [reader.cstring() for _ in range(4)]
    display_id = reader.uint32()
    quality_value = reader.uint32()
    flags = [reader.uint32(), reader.uint32()]
    buy_price = reader.int32()
    sell_price = reader.uint32()
    inventory_type = reader.uint32()
    allowable_class = reader.uint32()
    allowable_race = reader.uint32()
    item_level = reader.uint32()
    required_level = reader.uint32()
    requirements = {
        "skill": reader.uint32(), "skillRank": reader.uint32(), "spell": reader.uint32(),
        "honorRank": reader.uint32(), "cityRank": reader.uint32(),
        "reputationFaction": reader.uint32(), "reputationRank": reader.uint32(),
    }
    max_count = reader.int32()
    stackable = reader.int32()
    container_slots = reader.uint32()
    stat_count = reader.uint32()
    if stat_count > 64:
        raise ValueError(f"implausible stat count {stat_count}")
    stat_rows = [{"type": reader.uint32(), "value": reader.int32()} for _ in range(stat_count)]
    scaling_distribution = reader.uint32()
    scaling_value = reader.uint32()
    damages = [
        {"min": reader.float32(), "max": reader.float32(), "school": reader.uint32()}
        for _ in range(2)
    ]
    resistances = [reader.uint32() for _ in range(7)]
    delay = reader.uint32()
    ammo_type = reader.uint32()
    ranged_mod_range = reader.float32()
    spells = []
    for _ in range(5):
        spell = {
            "id": reader.uint32(), "trigger": reader.uint32(), "charges": reader.int32(),
            "cooldownMs": reader.int32(), "category": reader.uint32(),
            "categoryCooldownMs": reader.int32(),
        }
        if spell["id"]:
            spells.append(spell)
    bonding = reader.uint32()
    description = reader.cstring()
    tail_names = (
        "pageText", "languageId", "pageMaterial", "startQuest", "lockId",
        "material", "sheath", "randomProperty", "randomSuffix", "block",
        "itemSet", "maxDurability", "area", "map", "bagFamily", "totemCategory",
    )
    tail: dict[str, object] = {}
    for name in tail_names:
        tail[name] = reader.int32() if name in {"material", "randomProperty", "randomSuffix"} else reader.uint32()
    sockets = []
    for position in range(3):
        color = reader.uint32()
        content = reader.uint32()
        if color:
            sockets.append({"position": position, "colorMask": color, "color": SOCKET_COLORS.get(color, "ASCENSION"), "content": content})
    tail.update({
        "socketBonus": reader.uint32(), "gemProperties": reader.uint32(),
        "requiredDisenchantSkill": reader.uint32(), "armorDamageModifier": reader.float32(),
        "duration": reader.uint32(), "itemLimitCategory": reader.uint32(), "holidayId": reader.uint32(),
    })

    stats: dict[str, float] = {}
    unknown_stats = []
    for row in stat_rows:
        key = STAT_KEYS.get(row["type"])
        if key:
            stats[key] = stats.get(key, 0) + row["value"]
        else:
            unknown_stats.append(row)
    armor = resistances[0]
    if armor:
        stats["armor"] = armor
    physical = [damage for damage in damages if damage["min"] or damage["max"]]
    total_min = sum(float(damage["min"]) for damage in physical)
    total_max = sum(float(damage["max"]) for damage in physical)
    speed = delay / 1000 if delay else None
    dps = ((total_min + total_max) / 2 / speed) if speed and physical else None
    remainder = payload[reader.offset:]

    return {
        "id": str(item_id),
        "name": names[0] or f"Unknown Item {item_id}",
        "quality": QUALITY[quality_value] if quality_value < len(QUALITY) else "COMMON",
        "itemLevel": item_level,
        "requiredLevel": required_level or 1,
        "slot": SLOTS.get(inventory_type),
        "inventoryType": inventory_type,
        "itemClass": item_class,
        "subclass": subclass,
        "armorType": ARMOR_TYPES.get(subclass) if item_class == 4 else None,
        "armor": armor,
        "displayId": display_id,
        "weaponMinDamage": total_min if physical else None,
        "weaponMaxDamage": total_max if physical else None,
        "weaponSpeed": speed if physical else None,
        "weaponDps": dps,
        "stats": stats,
        "sockets": sockets,
        "spells": spells,
        "sourceUrl": f"realm-cache://item/{item_id}",
        "sourceRealm": "CONQUEST_OF_AZEROTH",
        "rawTooltipHtml": description,
        "rawPayload": {
            "source": "coa-realm-itemcache", "names": names, "soundOverride": sound_override,
            "flags": flags, "buyPrice": buy_price, "sellPrice": sell_price,
            "allowableClass": allowable_class, "allowableRace": allowable_race,
            "requirements": requirements, "maxCount": max_count, "stackable": stackable,
            "containerSlots": container_slots, "statRows": stat_rows,
            "unknownStats": unknown_stats, "scalingStatDistribution": scaling_distribution,
            "scalingStatValue": scaling_value, "damages": damages,
            "resistances": resistances, "delayMs": delay, "ammoType": ammo_type,
            "rangedModRange": ranged_mod_range, "bonding": bonding, **tail,
            "unparsedBytes": remainder.hex(),
        },
        "contentHash": hashlib.sha256(payload).hexdigest(),
        "parsedBytes": reader.offset,
        "recordBytes": len(payload),
    }


def records(path: Path) -> Iterator[dict[str, object]]:
    data = path.read_bytes()
    if len(data) < 24 or data[:4] != b"BDIW":
        raise ValueError(f"{path} is not a supported itemcache.wdb")
    offset = 24
    while offset + 8 <= len(data):
        item_id, size = struct.unpack_from("<II", data, offset)
        offset += 8
        if item_id == 0 and size == 0:
            break
        if size > len(data) - offset:
            raise ValueError(f"item {item_id} declares {size} bytes; only {len(data) - offset} remain")
        payload = data[offset:offset + size]
        offset += size
        try:
            yield parse_payload(item_id, payload)
        except Exception as error:
            raise ValueError(f"could not parse item {item_id} ({size} bytes): {error}") from error


def output_stream(path: Path) -> TextIO:
    return gzip.open(path, "wt", encoding="utf-8") if path.suffix == ".gz" else path.open("w", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, required=True, help="Rexxar - Conquest of Azeroth/itemcache.wdb")
    parser.add_argument("--output", type=Path, default=Path("coa-realm-items.ndjson.gz"))
    parser.add_argument("--equippable-only", action="store_true")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = equippable = extensions = 0
    with output_stream(args.output) as destination:
        for item in records(args.cache):
            count += 1
            if item["slot"]:
                equippable += 1
            if item["parsedBytes"] != item["recordBytes"]:
                extensions += 1
            if not args.equippable_only or item["slot"]:
                destination.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"records": count, "equippable": equippable, "recordsWithExtensions": extensions, "output": str(args.output)}))


if __name__ == "__main__":
    main()
