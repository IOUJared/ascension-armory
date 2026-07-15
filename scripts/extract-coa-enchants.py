#!/usr/bin/env python3
"""Extract the current CoA enchanting catalog from AtlasLoot and client DBCs."""

from __future__ import annotations

import argparse
import json
import re
import struct
from pathlib import Path

try:
    import mpyq
except ImportError as error:
    raise SystemExit("mpyq is required; run this script with `uv run --with mpyq python`") from error


SLOT_RULES = {
    "Boots": (["FEET"], None),
    "Bracer": (["WRISTS"], None),
    "Chest": (["CHEST"], None),
    "Cloak": (["BACK"], None),
    "Gloves": (["HANDS"], None),
    "Shield": (["OFF_HAND"], "SHIELD"),
    "2H Weapon": (["MAIN_HAND"], "TWO_HANDED"),
    "Weapon": (["MAIN_HAND", "OFF_HAND"], "WEAPON"),
}

STAT_NAMES = {
    "agility": "agility",
    "strength": "strength",
    "stamina": "stamina",
    "intellect": "intellect",
    "spirit": "spirit",
    "health": "health",
    "mana": "mana",
    "armor": "armor",
    "spell power": "spell_power",
    "haste rating": "haste_rating",
    "hit rating": "hit_rating",
    "defense rating": "defense_rating",
    "shield block rating": "block_rating",
}

AURA_STATS = {0: "strength", 1: "agility", 2: "stamina", 3: "intellect", 4: "spirit"}


def read_dbc(path: Path, filename: str) -> tuple[dict[int, tuple[int, ...]], bytes]:
    archive = mpyq.MPQArchive(str(path), listfile=False)
    data = archive.read_file(filename)
    if data is None:
        raise FileNotFoundError(f"{filename} was not found in {path}")
    magic, rows, fields, record_size, string_size = struct.unpack_from("<4s4I", data, 0)
    if magic != b"WDBC" or record_size != fields * 4:
        raise ValueError(f"Unsupported DBC header in {path}: {magic!r}, {fields=}, {record_size=}")
    records = {
        record[0]: record
        for record in (
            struct.unpack_from(f"<{fields}I", data, 20 + index * record_size)
            for index in range(rows)
        )
    }
    strings_at = 20 + rows * record_size
    return records, data[strings_at:strings_at + string_size]


def dbc_string(strings: bytes, offset: int) -> str:
    if offset < 0 or offset >= len(strings):
        return ""
    end = strings.find(b"\0", offset)
    return strings[offset:end if end >= 0 else len(strings)].decode("utf-8", "replace")


def clean_tooltip(value: str) -> str:
    return re.sub(r"\|c[0-9a-fA-F]{8}|\|r", "", value).strip()


def add(stats: dict[str, float], key: str, value: float) -> None:
    stats[key] = stats.get(key, 0) + value


def tooltip_stats(description: str) -> dict[str, float]:
    stats: dict[str, float] = {}
    lower = description.lower()

    all_stats = re.search(r"\+(\d+(?:\.\d+)?)\s+all stats", lower)
    if all_stats:
        amount = float(all_stats.group(1))
        for key in ("strength", "agility", "stamina", "intellect", "spirit"):
            add(stats, key, amount)

    periodic = re.search(r"\+(\d+(?:\.\d+)?)\s+mana and health every 5 sec", lower)
    if periodic:
        amount = float(periodic.group(1))
        add(stats, "mp5", amount)
        add(stats, "hp5", amount)

    mana_regen = re.search(r"mana regen\s+(\d+(?:\.\d+)?)\s+per 5 sec", lower)
    if mana_regen:
        add(stats, "mp5", float(mana_regen.group(1)))

    school_power = re.search(r"increases\s+(?:fire|frost|shadow)\s+spell power by\s+(\d+(?:\.\d+)?)", lower)
    if school_power:
        add(stats, "spell_power", float(school_power.group(1)))

    for label, key in STAT_NAMES.items():
        if label == "spell power" and school_power:
            continue
        match = re.search(rf"\+(\d+(?:\.\d+)?)\s+{re.escape(label)}\b", lower)
        if match:
            add(stats, key, float(match.group(1)))
    return stats


def aura_stat(spell: tuple[int, ...] | None) -> tuple[str, float] | None:
    if not spell or len(spell) < 113:
        return None
    for effect_index in range(3):
        if spell[71 + effect_index] != 6 or spell[95 + effect_index] != 29:  # SPELL_AURA_MOD_STAT
            continue
        stat = AURA_STATS.get(spell[110 + effect_index])
        if stat:
            raw = spell[80 + effect_index]
            base_points = raw if raw < 2**31 else raw - 2**32
            amount = base_points + 1
            if amount > 0:
                return stat, float(amount)
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--game-dir", type=Path, required=True, help="Path to the ascension-live directory")
    parser.add_argument("--output", type=Path, default=Path("src/data/coa-enchants.json"))
    args = parser.parse_args()

    atlas_path = args.game_dir / "Interface/AddOns/AtlasLoot_Crafting_OriginalWoW/craftingCLASSIC.lua"
    atlas = atlas_path.read_text(encoding="utf-8", errors="replace")
    enchanting = atlas.split('AtlasLoot_Data["EnchantingCLASSIC"] = {', 1)[1].split("\n}\n", 1)[0]
    spell_records, _ = read_dbc(args.game_dir / "Data/patch-T.MPQ", r"DBFilesClient\Spell.dbc")
    enchant_records, enchant_strings = read_dbc(
        args.game_dir / "Data/patch-S.MPQ", r"DBFilesClient\SpellItemEnchantment.dbc"
    )

    group = ""
    items: list[dict[str, object]] = []
    for line in enchanting.splitlines():
        group_match = re.search(r'Name\s*=\s*AL\["Enchant ([^"]+)"\]', line)
        if group_match:
            group = group_match.group(1)
        entry = re.search(r"spellID\s*=\s*(\d+).*?--\s*(Enchant .+?)\s*$", line)
        if not entry or group not in SLOT_RULES:
            continue
        spell_id = int(entry.group(1))
        spell = spell_records.get(spell_id)
        if not spell or len(spell) <= 110:
            continue
        enchantment_id = spell[110]
        enchantment = enchant_records.get(enchantment_id)
        if not enchantment or len(enchantment) < 38:
            continue
        description = clean_tooltip(dbc_string(enchant_strings, enchantment[14]))
        stats = tooltip_stats(description)

        # Some current-client enchantment labels intentionally omit their
        # magnitude. Resolve simple primary-stat auras from the linked spell.
        if not stats and not description.lower().startswith("equip:") and 1 not in enchantment[1:4]:
            # Proc/passive packages are real choices, but their combat value
            # cannot be represented as a permanent primary-stat bonus.
            for effect_index in range(3):
                if enchantment[1 + effect_index] != 3:
                    continue
                linked = spell_records.get(enchantment[10 + effect_index])
                resolved = aura_stat(linked)
                if resolved:
                    add(stats, *resolved)
            # Spell Power's current label is magnitude-free, but the DBC keeps
            # its exact amount in EffectPointsMin/Max.
            if "spell power" in description.lower():
                amount = max(enchantment[4:10])
                if amount:
                    add(stats, "spell_power", float(amount))

        slots, constraint = SLOT_RULES[group]
        items.append({
            "id": f"spell:{spell_id}",
            "spellId": spell_id,
            "enchantmentId": enchantment_id,
            "name": entry.group(2).strip(),
            "description": description or entry.group(2).strip(),
            "slots": slots,
            **({"constraint": constraint} if constraint else {}),
            "minimumItemLevel": enchantment[37],
            "stats": {key: int(value) if value.is_integer() else value for key, value in stats.items()},
            "modeled": bool(stats),
            "source": "COA_CLIENT_DBC_ATLASLOOT",
        })

    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = {"source": "Current CoA client DBC + installed AtlasLoot", "items": items}
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "enchants": len(items), "modeled": sum(bool(item["modeled"]) for item in items)}))


if __name__ == "__main__":
    main()
