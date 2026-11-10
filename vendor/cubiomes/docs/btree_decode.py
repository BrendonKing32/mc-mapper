#!/usr/bin/env python3
"""
Decode a cubiomes biome-tree header (btree*.h) into a human-readable form.

Usage:
    python3 btree_decode.py path/to/btreeXX.h [--leaves-only] [--biome NAME]

Format (from btree21wd.h header comment):

    Each uint64_t node packs into 8 bytes:

      bits 0-7   : param index for noise[0] = temperature
      bits 8-15  : param index for noise[1] = humidity
      bits 16-23 : param index for noise[2] = continentalness
      bits 24-31 : param index for noise[3] = erosion
      bits 32-39 : param index for noise[4] = depth
      bits 40-47 : param index for noise[5] = weirdness
      bits 48-55 : leaf marker payload (biome id when top byte is 0xFF) OR
                   low byte of child base index
      bits 56-63 : 0xFF if leaf, otherwise high byte of child base index

This script reads the param[][2] table and the nodes[] array from a
btreeNAME.h file, then walks the tree and prints leaves (or the whole
structure) with parameter ranges in min..max form.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


# Inverse of nptree_bin.py's bdic.
BIOME_NAME_BY_ID: dict[int, str] = {
    0: "ocean", 1: "plains", 2: "desert", 3: "mountains", 4: "forest",
    5: "taiga", 6: "swamp", 7: "river", 8: "nether_wastes", 9: "the_end",
    10: "frozen_ocean", 11: "frozen_river", 12: "snowy_tundra",
    13: "snowy_mountains", 14: "mushroom_fields", 15: "mushroom_field_shore",
    16: "beach", 17: "desert_hills", 18: "wooded_hills", 19: "taiga_hills",
    20: "mountain_edge", 21: "jungle", 22: "jungle_hills", 23: "jungle_edge",
    24: "deep_ocean", 25: "stone_shore", 26: "snowy_beach", 27: "birch_forest",
    28: "birch_forest_hills", 29: "dark_forest", 30: "snowy_taiga",
    31: "snowy_taiga_hills", 32: "giant_tree_taiga", 33: "giant_tree_taiga_hills",
    34: "wooded_mountains", 35: "savanna", 36: "savanna_plateau", 37: "badlands",
    38: "wooded_badlands_plateau", 39: "badlands_plateau",
    40: "small_end_islands", 41: "end_midlands", 42: "end_highlands",
    43: "end_barrens", 44: "warm_ocean", 45: "lukewarm_ocean", 46: "cold_ocean",
    47: "deep_warm_ocean", 48: "deep_lukewarm_ocean", 49: "deep_cold_ocean",
    50: "deep_frozen_ocean", 127: "the_void",
    168: "bamboo_jungle", 169: "bamboo_jungle_hills",
    170: "soul_sand_valley", 171: "crimson_forest", 172: "warped_forest",
    173: "basalt_deltas", 174: "dripstone_caves", 175: "lush_caves",
    177: "meadow", 178: "grove", 179: "snowy_slopes", 180: "jagged_peaks",
    181: "frozen_peaks", 182: "stony_peaks",
    183: "deep_dark", 184: "mangrove_swamp",
    185: "cherry_grove", 186: "pale_garden",
}
# Mutation variants are <base>+128 and reuse the underlying biome code path.
for base_id in list(BIOME_NAME_BY_ID):
    if base_id < 128 and base_id + 128 not in BIOME_NAME_BY_ID:
        BIOME_NAME_BY_ID[base_id + 128] = BIOME_NAME_BY_ID[base_id] + "+M"

NOISE_DIMS = ["temperature", "humidity", "continentalness",
              "erosion", "depth", "weirdness"]


def parse_btree_header(path: Path) -> tuple[list[int], list[tuple[int, int]], list[int]]:
    """Read btreeNAME.h and return (steps, param_pairs, nodes)."""
    text = path.read_text()

    steps_match = re.search(r"_steps\[\]\s*=\s*\{([^}]+)\}", text)
    if not steps_match:
        raise ValueError(f"could not find steps array in {path}")
    steps = [int(x) for x in steps_match.group(1).split(",") if x.strip()]

    param_match = re.search(
        r"_param\[\]\[2\]\s*=\s*\{(.*?)\};", text, flags=re.DOTALL,
    )
    if not param_match:
        raise ValueError(f"could not find param array in {path}")
    param_body = re.sub(r"//[^\n]*", "", param_match.group(1))
    pairs = re.findall(r"\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}", param_body)
    param_pairs = [(int(a), int(b)) for a, b in pairs]

    nodes_match = re.search(
        r"_nodes\[\]\s*=\s*\{(.*?)\};", text, flags=re.DOTALL,
    )
    if not nodes_match:
        raise ValueError(f"could not find nodes array in {path}")
    nodes_body = re.sub(r"//[^\n]*", "", nodes_match.group(1))
    nodes = [int(tok, 16) for tok in re.findall(r"0x[0-9A-Fa-f]+", nodes_body)]

    return steps, param_pairs, nodes


def is_leaf(node: int) -> bool:
    return (node >> 56) & 0xFF == 0xFF


def biome_id(node: int) -> int:
    return (node >> 48) & 0xFF


def child_index(node: int) -> int:
    return (node >> 48) & 0xFFFF


def param_indices(node: int) -> tuple[int, int, int, int, int, int]:
    return tuple((node >> (8 * i)) & 0xFF for i in range(6))


def node_box(node: int, params: list[tuple[int, int]]) -> list[tuple[int, int]]:
    return [params[idx] for idx in param_indices(node)]


def leaf_depth(steps: list[int]) -> int:
    return next(i for i, s in enumerate(steps) if s == 0)


def walk(idx: int, depth: int, steps: list[int], nodes: list[int], order: int):
    """Yield (idx, depth) for every reachable node."""
    yield idx, depth
    if is_leaf(nodes[idx]):
        return
    if depth >= len(steps) or steps[depth] == 0:
        return
    base = child_index(nodes[idx])
    step = steps[depth]
    for k in range(order):
        child = base + k * step
        if child >= len(nodes):
            break
        yield from walk(child, depth + 1, steps, nodes, order)


def fmt_box(box: list[tuple[int, int]]) -> str:
    parts = []
    for dim, (lo, hi) in zip(NOISE_DIMS, box):
        parts.append(f"{dim}=[{lo},{hi}]")
    return " ".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("path", type=Path)
    parser.add_argument("--leaves-only", action="store_true",
                        help="print only leaf nodes")
    parser.add_argument("--biome", default=None,
                        help="filter to leaves whose biome name matches this substring")
    parser.add_argument("--order", type=int, default=6,
                        help="branching factor (default 6)")
    args = parser.parse_args()

    steps, params, nodes = parse_btree_header(args.path)
    print(f"steps={steps} params={len(params)} nodes={len(nodes)} order={args.order}",
          file=sys.stderr)

    leaves = 0
    branches = 0
    for idx, depth in walk(0, 0, steps, nodes, args.order):
        node = nodes[idx]
        leaf = is_leaf(node)
        if args.leaves_only and not leaf:
            continue
        if leaf:
            leaves += 1
            bid = biome_id(node)
            name = BIOME_NAME_BY_ID.get(bid, f"biome#{bid}")
            if args.biome and args.biome.lower() not in name.lower():
                continue
            box = node_box(node, params)
            print(f"[{idx:5d}] d={depth} LEAF biome={name:<28} {fmt_box(box)}")
        else:
            branches += 1
            base = child_index(node)
            step = steps[depth] if depth < len(steps) else 0
            box = node_box(node, params)
            print(f"[{idx:5d}] d={depth} NODE -> children @{base} step={step}  bbox: {fmt_box(box)}")

    print(f"\ntotal leaves={leaves} branches={branches}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
