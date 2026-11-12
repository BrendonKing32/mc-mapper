#!/usr/bin/env python3
"""
Pure-Python regenerator for cubiomes biome-tree headers (btree*.h).

Replaces the IntelliJ-debugger workflow that nptree_c.py + nptree_bin.py used
with a single-script port of Mojang's biome-list construction
(`OverworldBiomeBuilder.addBiomes`) and search-tree builder
(`Climate.RTree.build`). The script reads no external data — every constant
and table that drives MC's biome placement is encoded inline so the script
works without a Minecraft jar.

Usage:
    python3 btreegen.py 1.21.4 -o tables/btree21wd.h
    python3 btreegen.py 1.21.4 --check tables/btree21wd.h   # bit-exact diff

The "version" arg selects which set of OverworldBiomeBuilder data tables to
use (e.g. 1.21.4 vs 1.21.5 differ only in PLATEAU_BIOMES and
PLATEAU_BIOMES_VARIANT cell [2][4]).

Source-of-truth for the port:
  net/minecraft/world/level/biome/Climate.java
  net/minecraft/world/level/biome/OverworldBiomeBuilder.java
in mja00/minecraft commits 3aeadd678 (1.21.4) and c90630d0 (1.21.5).
"""

from __future__ import annotations

import argparse
import math
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


# ---------------------------------------------------------------------------
# Climate primitives  --  net/minecraft/world/level/biome/Climate.java
# ---------------------------------------------------------------------------


def quantize(f: float) -> int:
    """Mirror of Climate.quantizeCoord: (long)(float * 10000.0F).

    Java casts a 32-bit float result to long, truncating toward zero. Python's
    int() also truncates toward zero, but Python uses 64-bit doubles by
    default. For inputs that are exactly representable in float32 (which is
    the case for every constant in OverworldBiomeBuilder), the difference is
    zero. We force float32 to be safe in case any future input is precision-
    sensitive.
    """
    f32 = struct.unpack("f", struct.pack("f", f))[0]
    product = struct.unpack("f", struct.pack("f", f32 * 10000.0))[0]
    return int(product)  # int() truncates toward zero — matches Java (long) cast


@dataclass(frozen=True)
class Parameter:
    """Closed interval [min, max] of quantized coords. Mirrors Climate.Parameter."""

    min: int
    max: int

    @staticmethod
    def point(f: float) -> "Parameter":
        return Parameter.span_f(f, f)

    @staticmethod
    def span_f(f: float, f1: float) -> "Parameter":
        if f > f1:
            raise ValueError(f"min > max: {f} {f1}")
        return Parameter(quantize(f), quantize(f1))

    @staticmethod
    def span_p(a: "Parameter", b: "Parameter") -> "Parameter":
        if a.min > b.max:
            raise ValueError(f"min > max: {a} {b}")
        return Parameter(a.min, b.max)

    def union(self, other: "Parameter | None") -> "Parameter":
        if other is None:
            return self
        return Parameter(min(self.min, other.min), max(self.max, other.max))

    def midpoint(self) -> int:
        # Java integer division truncates toward zero. For sums of small ints
        # (-2*10000 to 2*10000) this is just the obvious midpoint.
        # Python's // truncates toward -inf, so we use int(.../2) which truncates
        # toward zero, matching Java semantics.
        return int((self.min + self.max) / 2)


@dataclass(frozen=True)
class ParameterPoint:
    temperature: Parameter
    humidity: Parameter
    continentalness: Parameter
    erosion: Parameter
    depth: Parameter
    weirdness: Parameter
    offset: int  # quantized

    def parameter_space(self) -> list[Parameter]:
        # 7 dims: T, H, C, E, D, W, offset (offset is point-shaped Parameter)
        return [
            self.temperature, self.humidity, self.continentalness,
            self.erosion, self.depth, self.weirdness,
            Parameter(self.offset, self.offset),
        ]


def make_point(
    t: Parameter, h: Parameter, c: Parameter, e: Parameter,
    d: Parameter, w: Parameter, offset_f: float,
) -> ParameterPoint:
    """Mirror of Climate.parameters(...) static factory."""
    return ParameterPoint(t, h, c, e, d, w, quantize(offset_f))


# ---------------------------------------------------------------------------
# Climate.RTree.build  --  Climate.java lines 246-462
# ---------------------------------------------------------------------------


class TreeNode:
    """Base for Leaf and SubTree. parameter_space is the 7-dim bbox.

    `_idx` and `_first_child_idx` are set during DFS allocation in phase 4.
    """
    __slots__ = ("parameter_space", "_idx", "_first_child_idx")

    def __init__(self, parameter_space: list[Parameter]):
        self.parameter_space = parameter_space
        self._idx = -1
        self._first_child_idx = -1


class Leaf(TreeNode):
    __slots__ = ("biome",)

    def __init__(self, point: ParameterPoint, biome: str):
        super().__init__(point.parameter_space())
        self.biome = biome


class SubTree(TreeNode):
    __slots__ = ("children",)

    def __init__(self, children: Sequence[TreeNode]):
        super().__init__(_subtree_bbox(children))
        self.children: tuple[TreeNode, ...] = tuple(children)


def _subtree_bbox(children: Sequence[TreeNode]) -> list[Parameter]:
    """Mirror of Climate.RTree.buildParameterSpace — per-dim union over kids."""
    if not children:
        raise ValueError("SubTree needs at least one child")
    out: list[Parameter | None] = [None] * 7
    for node in children:
        for k in range(7):
            cur = out[k]
            seg = node.parameter_space[k]
            out[k] = seg if cur is None else seg.union(cur)
    return out  # type: ignore[return-value]


def _cost(box: Sequence[Parameter]) -> int:
    """Mirror of Climate.RTree.cost — sum of |max-min| per dim."""
    return sum(abs(p.max - p.min) for p in box)


def _bucketize(nodes: list[TreeNode]) -> list[list[TreeNode]]:
    """Mirror of Climate.RTree.bucketize.

    Walks the (already-sorted) list, greedily filling buckets of size
    `floor(6 ^ floor(log_6(n - 0.01)))`. The last bucket may be smaller.
    """
    n = len(nodes)
    # Match Java's: (int)Math.pow(6.0, Math.floor(Math.log(n - 0.01) / Math.log(6.0)))
    bucket_size = int(math.pow(6.0, math.floor(math.log(n - 0.01) / math.log(6.0))))
    out: list[list[TreeNode]] = []
    cur: list[TreeNode] = []
    for node in nodes:
        cur.append(node)
        if len(cur) >= bucket_size:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def _multi_dim_sort_key(start_dim: int, dim_count: int, abs_flag: bool):
    """Build a tuple-key matching Java's chained Comparator (cyclic from start_dim).

    Java does: comparator(j, flag).thenComparing(comparator((j+1) % i, flag)).
    Etc. for k=1..dim_count-1. With stable sort, equivalent to a tuple-key
    `(key_j, key_{j+1 mod i}, ...)` over `dim_count` dimensions.
    """
    chain = [(start_dim + k) % dim_count for k in range(dim_count)]

    def key(node: TreeNode) -> tuple[int, ...]:
        return tuple(
            (abs(node.parameter_space[d].midpoint())
             if abs_flag else node.parameter_space[d].midpoint())
            for d in chain
        )

    return key


def _build(dim_count: int, nodes: list[TreeNode]) -> TreeNode:
    """Verbatim port of Climate.RTree.build."""
    if not nodes:
        raise ValueError("Need at least one child to build a node")
    if len(nodes) == 1:
        return nodes[0]
    if len(nodes) <= 6:
        # Final-sort: ascending sum of |midpoint| over all dims.
        nodes.sort(key=lambda n: sum(abs(n.parameter_space[k].midpoint())
                                     for k in range(dim_count)))
        return SubTree(nodes)

    best_cost = math.inf
    best_dim = -1
    best_buckets: list[list[TreeNode]] | None = None

    # Try each starting dim, keep the partition with lowest total bbox-perimeter.
    for start_dim in range(dim_count):
        nodes.sort(key=_multi_dim_sort_key(start_dim, dim_count, abs_flag=False))
        buckets = _bucketize(nodes)
        total = sum(_cost(_subtree_bbox(b)) for b in buckets)
        if best_cost > total:
            best_cost = total
            best_dim = start_dim
            best_buckets = [b[:] for b in buckets]

    assert best_buckets is not None
    # Re-sort buckets in the chosen dim order with abs_flag=True for the final
    # arrangement. Java sorts the *list of subtrees* (not the inner nodes), so
    # we wrap each bucket in a SubTree first, sort the SubTrees, then unwrap
    # for recursion.
    wrappers = [SubTree(b) for b in best_buckets]
    wrappers.sort(key=_multi_dim_sort_key(best_dim, dim_count, abs_flag=True))
    return SubTree([_build(dim_count, list(w.children)) for w in wrappers])


def build_tree(entries: list[tuple[ParameterPoint, str]]) -> TreeNode:
    """Top-level entry point. Mirrors Climate.RTree.create."""
    if not entries:
        raise ValueError("Need at least one value to build the search tree.")
    leaves: list[TreeNode] = [Leaf(p, b) for p, b in entries]
    return _build(7, leaves)


# ---------------------------------------------------------------------------
# OverworldBiomeBuilder port -- net/minecraft/world/level/biome/OverworldBiomeBuilder.java
# ---------------------------------------------------------------------------


# Biome name → cubiomes ID. Mirrors nptree_bin.py's bdic. We strip the
# "minecraft:" prefix when looking up.
BIOME_ID: dict[str, int] = {}


def _init_biome_ids() -> None:
    seq = [
        "ocean", "plains", "desert", "mountains", "forest", "taiga", "swamp",
        "river", "nether_wastes", "the_end", "frozen_ocean", "frozen_river",
        "snowy_tundra", "snowy_mountains", "mushroom_fields",
        "mushroom_field_shore", "beach", "desert_hills", "wooded_hills",
        "taiga_hills", "mountain_edge", "jungle", "jungle_hills",
        "jungle_edge", "deep_ocean", "stone_shore", "snowy_beach",
        "birch_forest", "birch_forest_hills", "dark_forest", "snowy_taiga",
        "snowy_taiga_hills", "giant_tree_taiga", "giant_tree_taiga_hills",
        "wooded_mountains", "savanna", "savanna_plateau", "badlands",
        "wooded_badlands_plateau", "badlands_plateau", "small_end_islands",
        "end_midlands", "end_highlands", "end_barrens", "warm_ocean",
        "lukewarm_ocean", "cold_ocean", "deep_warm_ocean",
        "deep_lukewarm_ocean", "deep_cold_ocean", "deep_frozen_ocean",
    ]
    for i, n in enumerate(seq):
        BIOME_ID[n] = i
    BIOME_ID["the_void"] = 127

    # Mutated variants (post-1.7) — unused by 1.18+ btree but kept for parity.
    mutated = [
        ("sunflower_plains", "plains"), ("desert_lakes", "desert"),
        ("gravelly_mountains", "mountains"), ("flower_forest", "forest"),
        ("taiga_mountains", "taiga"), ("swamp_hills", "swamp"),
        ("ice_spikes", "snowy_tundra"), ("modified_jungle", "jungle"),
        ("modified_jungle_edge", "jungle_edge"),
        ("tall_birch_forest", "birch_forest"),
        ("tall_birch_hills", "birch_forest_hills"),
        ("dark_forest_hills", "dark_forest"),
        ("snowy_taiga_mountains", "snowy_taiga"),
        ("giant_spruce_taiga", "giant_tree_taiga"),
        ("giant_spruce_taiga_hills", "giant_tree_taiga_hills"),
        ("modified_gravelly_mountains", "wooded_mountains"),
        ("shattered_savanna", "savanna"),
        ("shattered_savanna_plateau", "savanna_plateau"),
        ("eroded_badlands", "badlands"),
        ("modified_wooded_badlands_plateau", "wooded_badlands_plateau"),
        ("modified_badlands_plateau", "badlands_plateau"),
    ]
    for name, base in mutated:
        BIOME_ID[name] = BIOME_ID[base] + 128

    BIOME_ID["bamboo_jungle"] = 168
    BIOME_ID["bamboo_jungle_hills"] = 169
    BIOME_ID["soul_sand_valley"] = 170
    BIOME_ID["crimson_forest"] = 171
    BIOME_ID["warped_forest"] = 172
    BIOME_ID["basalt_deltas"] = 173
    BIOME_ID["dripstone_caves"] = 174
    BIOME_ID["lush_caves"] = 175
    BIOME_ID["meadow"] = 177
    BIOME_ID["grove"] = 178
    BIOME_ID["snowy_slopes"] = 179
    BIOME_ID["jagged_peaks"] = 180
    BIOME_ID["frozen_peaks"] = 181
    BIOME_ID["stony_peaks"] = 182
    # 1.18 renames (point to the legacy ID per nptree_bin.py).
    BIOME_ID["old_growth_birch_forest"] = BIOME_ID["tall_birch_forest"]
    BIOME_ID["old_growth_pine_taiga"] = BIOME_ID["giant_tree_taiga"]
    BIOME_ID["old_growth_spruce_taiga"] = BIOME_ID["giant_spruce_taiga"]
    BIOME_ID["snowy_plains"] = BIOME_ID["snowy_tundra"]
    BIOME_ID["sparse_jungle"] = BIOME_ID["jungle_edge"]
    BIOME_ID["stony_shore"] = BIOME_ID["stone_shore"]
    BIOME_ID["windswept_hills"] = BIOME_ID["mountains"]
    BIOME_ID["windswept_forest"] = BIOME_ID["wooded_mountains"]
    BIOME_ID["windswept_gravelly_hills"] = BIOME_ID["gravelly_mountains"]
    BIOME_ID["windswept_savanna"] = BIOME_ID["shattered_savanna"]
    BIOME_ID["wooded_badlands"] = BIOME_ID["wooded_badlands_plateau"]
    BIOME_ID["deep_dark"] = 183
    BIOME_ID["mangrove_swamp"] = 184
    BIOME_ID["cherry_grove"] = 185
    BIOME_ID["pale_garden"] = 186


_init_biome_ids()


# Biome name shortcuts used in the 5x5 tables — match upper-case Java names.
B = {
    name.upper(): name
    for name in (
        "deep_frozen_ocean", "deep_cold_ocean", "deep_ocean",
        "deep_lukewarm_ocean", "warm_ocean", "frozen_ocean", "cold_ocean",
        "ocean", "lukewarm_ocean",
        "snowy_plains", "snowy_taiga", "taiga", "plains", "forest",
        "old_growth_spruce_taiga", "flower_forest", "birch_forest",
        "dark_forest", "savanna", "jungle", "desert",
        "ice_spikes", "old_growth_pine_taiga", "sunflower_plains",
        "old_growth_birch_forest", "sparse_jungle", "bamboo_jungle",
        "meadow", "savanna_plateau", "badlands", "wooded_badlands",
        "cherry_grove", "pale_garden", "windswept_gravelly_hills",
        "windswept_hills", "windswept_forest", "windswept_savanna",
        "stony_shore", "mushroom_fields", "swamp", "mangrove_swamp",
        "snowy_beach", "beach", "snowy_slopes", "grove", "jagged_peaks",
        "frozen_peaks", "stony_peaks", "snowy_taiga_hills",
        "frozen_river", "river", "eroded_badlands",
        "dripstone_caves", "lush_caves", "deep_dark",
    )
}


@dataclass
class BiomeData:
    """Per-version data tables from OverworldBiomeBuilder.

    Only the fields that vary between versions are listed here; the others are
    produced inline in Builder.__init__ since they're hardcoded floats.
    """
    middle_biomes: list[list[str]]
    middle_biomes_variant: list[list[str | None]]
    plateau_biomes: list[list[str]]
    plateau_biomes_variant: list[list[str | None]]
    shattered_biomes: list[list[str | None]]


def biome_data_1_21_4() -> BiomeData:
    """OverworldBiomeBuilder.java tables at commit 3aeadd678."""
    M = B
    return BiomeData(
        middle_biomes=[
            [M["SNOWY_PLAINS"], M["SNOWY_PLAINS"], M["SNOWY_PLAINS"], M["SNOWY_TAIGA"], M["TAIGA"]],
            [M["PLAINS"],       M["PLAINS"],       M["FOREST"],       M["TAIGA"],       M["OLD_GROWTH_SPRUCE_TAIGA"]],
            [M["FLOWER_FOREST"], M["PLAINS"],      M["FOREST"],       M["BIRCH_FOREST"], M["DARK_FOREST"]],
            [M["SAVANNA"],      M["SAVANNA"],      M["FOREST"],       M["JUNGLE"],      M["JUNGLE"]],
            [M["DESERT"],       M["DESERT"],       M["DESERT"],       M["DESERT"],      M["DESERT"]],
        ],
        middle_biomes_variant=[
            [M["ICE_SPIKES"], None,                M["SNOWY_TAIGA"], None, None],
            [None,            None,                None,             None, M["OLD_GROWTH_PINE_TAIGA"]],
            [M["SUNFLOWER_PLAINS"], None,          None,             M["OLD_GROWTH_BIRCH_FOREST"], None],
            [None, None, M["PLAINS"], M["SPARSE_JUNGLE"], M["BAMBOO_JUNGLE"]],
            [None, None, None, None, None],
        ],
        plateau_biomes=[
            [M["SNOWY_PLAINS"],   M["SNOWY_PLAINS"],    M["SNOWY_PLAINS"], M["SNOWY_TAIGA"], M["SNOWY_TAIGA"]],
            [M["MEADOW"],         M["MEADOW"],          M["FOREST"],       M["TAIGA"],       M["OLD_GROWTH_SPRUCE_TAIGA"]],
            [M["MEADOW"],         M["MEADOW"],          M["MEADOW"],       M["MEADOW"],      M["DARK_FOREST"]],   # 1.21.4
            [M["SAVANNA_PLATEAU"], M["SAVANNA_PLATEAU"], M["FOREST"],       M["FOREST"],     M["JUNGLE"]],
            [M["BADLANDS"],       M["BADLANDS"],        M["BADLANDS"],     M["WOODED_BADLANDS"], M["WOODED_BADLANDS"]],
        ],
        plateau_biomes_variant=[
            [M["ICE_SPIKES"],   None, None, None, None],
            [M["CHERRY_GROVE"], None, M["MEADOW"], M["MEADOW"], M["OLD_GROWTH_PINE_TAIGA"]],
            [M["CHERRY_GROVE"], M["CHERRY_GROVE"], M["FOREST"], M["BIRCH_FOREST"], M["PALE_GARDEN"]],  # 1.21.4
            [None, None, None, None, None],
            [M["ERODED_BADLANDS"], M["ERODED_BADLANDS"], None, None, None],
        ],
        shattered_biomes=[
            [M["WINDSWEPT_GRAVELLY_HILLS"], M["WINDSWEPT_GRAVELLY_HILLS"], M["WINDSWEPT_HILLS"], M["WINDSWEPT_FOREST"], M["WINDSWEPT_FOREST"]],
            [M["WINDSWEPT_GRAVELLY_HILLS"], M["WINDSWEPT_GRAVELLY_HILLS"], M["WINDSWEPT_HILLS"], M["WINDSWEPT_FOREST"], M["WINDSWEPT_FOREST"]],
            [M["WINDSWEPT_HILLS"],          M["WINDSWEPT_HILLS"],          M["WINDSWEPT_HILLS"], M["WINDSWEPT_FOREST"], M["WINDSWEPT_FOREST"]],
            [None, None, None, None, None],
            [None, None, None, None, None],
        ],
    )


def biome_data_1_21_5() -> BiomeData:
    """OverworldBiomeBuilder.java tables at commit c90630d0.

    Diff vs 1.21.4: only two cells flipped, both in PLATEAU at [2][4]
    (neutral temperature, wettest humidity):
      - PLATEAU_BIOMES[2][4]:         DARK_FOREST  -> PALE_GARDEN
      - PLATEAU_BIOMES_VARIANT[2][4]: PALE_GARDEN  -> None
    Net effect: pale_garden in 1.21.5 covers the entire (T=2, H=4) plateau
    cell across all weirdness values, not just the variant (weirdness >= 0)
    slice it occupied in 1.21.4. Mansions also gain the pale_garden biome
    in 1.21.5 (handled separately in finders.c).
    """
    data = biome_data_1_21_4()
    data.plateau_biomes[2][4] = B["PALE_GARDEN"]
    data.plateau_biomes_variant[2][4] = None
    return data


def biome_data_for(version: str) -> BiomeData:
    if version == "1.21.4":
        return biome_data_1_21_4()
    if version == "1.21.5":
        return biome_data_1_21_5()
    raise ValueError(f"unsupported version: {version}")


class Builder:
    """Port of OverworldBiomeBuilder. Calls to addBiomes(consumer) emit a list
    of (ParameterPoint, biome_name_str) pairs in the same order Java emits.
    """

    def __init__(self, data: BiomeData):
        # ----- spans (all hardcoded floats from OWB lines 21-100) -------
        self.FULL_RANGE = Parameter.span_f(-1.0, 1.0)
        self.temperatures = [
            Parameter.span_f(-1.0, -0.45),
            Parameter.span_f(-0.45, -0.15),
            Parameter.span_f(-0.15, 0.2),
            Parameter.span_f(0.2, 0.55),
            Parameter.span_f(0.55, 1.0),
        ]
        self.humidities = [
            Parameter.span_f(-1.0, -0.35),
            Parameter.span_f(-0.35, -0.1),
            Parameter.span_f(-0.1, 0.1),
            Parameter.span_f(0.1, 0.3),
            Parameter.span_f(0.3, 1.0),
        ]
        self.erosions = [
            Parameter.span_f(-1.0, -0.78),
            Parameter.span_f(-0.78, -0.375),
            Parameter.span_f(-0.375, -0.2225),
            Parameter.span_f(-0.2225, 0.05),
            Parameter.span_f(0.05, 0.45),
            Parameter.span_f(0.45, 0.55),
            Parameter.span_f(0.55, 1.0),
        ]
        self.FROZEN_RANGE = self.temperatures[0]
        self.UNFROZEN_RANGE = Parameter.span_p(self.temperatures[1], self.temperatures[4])
        self.mushroomFieldsContinentalness = Parameter.span_f(-1.2, -1.05)
        self.deepOceanContinentalness = Parameter.span_f(-1.05, -0.455)
        self.oceanContinentalness = Parameter.span_f(-0.455, -0.19)
        self.coastContinentalness = Parameter.span_f(-0.19, -0.11)
        self.inlandContinentalness = Parameter.span_f(-0.11, 0.55)
        self.nearInlandContinentalness = Parameter.span_f(-0.11, 0.03)
        self.midInlandContinentalness = Parameter.span_f(0.03, 0.3)
        self.farInlandContinentalness = Parameter.span_f(0.3, 1.0)

        # ----- biome 5x5 lookups (OWB lines 69-110) -----
        warm_ocean = B["WARM_OCEAN"]
        self.OCEANS = [
            [B["DEEP_FROZEN_OCEAN"], B["DEEP_COLD_OCEAN"], B["DEEP_OCEAN"], B["DEEP_LUKEWARM_OCEAN"], warm_ocean],
            [B["FROZEN_OCEAN"],      B["COLD_OCEAN"],      B["OCEAN"],      B["LUKEWARM_OCEAN"],      warm_ocean],
        ]
        self.MIDDLE_BIOMES = data.middle_biomes
        self.MIDDLE_BIOMES_VARIANT = data.middle_biomes_variant
        self.PLATEAU_BIOMES = data.plateau_biomes
        self.PLATEAU_BIOMES_VARIANT = data.plateau_biomes_variant
        self.SHATTERED_BIOMES = data.shattered_biomes

        self._entries: list[tuple[ParameterPoint, str]] = []

    # ------------------------------------------------------------------
    # consumer.accept helpers — preserve exact emit order from Java.
    # ------------------------------------------------------------------
    def _emit_surface(
        self, t: Parameter, h: Parameter, c: Parameter, e: Parameter,
        w: Parameter, offset: float, biome: str,
    ) -> None:
        # Mirror of addSurfaceBiome. Emits depth=point(0.0) AND depth=point(1.0).
        self._entries.append(
            (make_point(t, h, c, e, Parameter.point(0.0), w, offset), biome))
        self._entries.append(
            (make_point(t, h, c, e, Parameter.point(1.0), w, offset), biome))

    def _emit_underground(
        self, t: Parameter, h: Parameter, c: Parameter, e: Parameter,
        w: Parameter, offset: float, biome: str,
    ) -> None:
        # depth=Parameter.span(0.2, 0.9) (OWB:1039)
        self._entries.append(
            (make_point(t, h, c, e, Parameter.span_f(0.2, 0.9), w, offset), biome))

    def _emit_bottom(
        self, t: Parameter, h: Parameter, c: Parameter, e: Parameter,
        w: Parameter, offset: float, biome: str,
    ) -> None:
        # depth=Parameter.point(1.1) (OWB:1059)
        self._entries.append(
            (make_point(t, h, c, e, Parameter.point(1.1), w, offset), biome))

    # ------------------------------------------------------------------
    # picker helpers — OWB lines 924-996.
    # ------------------------------------------------------------------
    def _pick_middle(self, i: int, j: int, w: Parameter) -> str:
        if w.max < 0:
            return self.MIDDLE_BIOMES[i][j]
        v = self.MIDDLE_BIOMES_VARIANT[i][j]
        return v if v is not None else self.MIDDLE_BIOMES[i][j]

    def _pick_middle_or_badlands_if_hot(self, i: int, j: int, w: Parameter) -> str:
        if i == 4:
            return self._pick_badlands(j, w)
        return self._pick_middle(i, j, w)

    def _pick_middle_or_badlands_if_hot_or_slope_if_cold(self, i: int, j: int, w: Parameter) -> str:
        if i == 0:
            return self._pick_slope(i, j, w)
        return self._pick_middle_or_badlands_if_hot(i, j, w)

    def _maybe_pick_windswept_savanna(
        self, i: int, j: int, w: Parameter, fallback: str,
    ) -> str:
        if i > 1 and j < 4 and w.max >= 0:
            return B["WINDSWEPT_SAVANNA"]
        return fallback

    def _pick_shattered_coast(self, i: int, j: int, w: Parameter) -> str:
        rk = self._pick_middle(i, j, w) if w.max >= 0 else self._pick_beach(i, j)
        return self._maybe_pick_windswept_savanna(i, j, w, rk)

    def _pick_beach(self, i: int, j: int) -> str:
        if i == 0:
            return B["SNOWY_BEACH"]
        return B["DESERT"] if i == 4 else B["BEACH"]

    def _pick_badlands(self, i: int, w: Parameter) -> str:
        if i < 2:
            return B["BADLANDS"] if w.max < 0 else B["ERODED_BADLANDS"]
        return B["BADLANDS"] if i < 3 else B["WOODED_BADLANDS"]

    def _pick_plateau(self, i: int, j: int, w: Parameter) -> str:
        if w.max >= 0:
            v = self.PLATEAU_BIOMES_VARIANT[i][j]
            if v is not None:
                return v
        return self.PLATEAU_BIOMES[i][j]

    def _pick_peak(self, i: int, j: int, w: Parameter) -> str:
        if i <= 2:
            return B["JAGGED_PEAKS"] if w.max < 0 else B["FROZEN_PEAKS"]
        return B["STONY_PEAKS"] if i == 3 else self._pick_badlands(j, w)

    def _pick_slope(self, i: int, j: int, w: Parameter) -> str:
        if i >= 3:
            return self._pick_plateau(i, j, w)
        return B["SNOWY_SLOPES"] if j <= 1 else B["GROVE"]

    def _pick_shattered(self, i: int, j: int, w: Parameter) -> str:
        rk = self.SHATTERED_BIOMES[i][j]
        return rk if rk is not None else self._pick_middle(i, j, w)

    # ------------------------------------------------------------------
    # addBiomes pipeline — OWB lines 134-922.
    # ------------------------------------------------------------------
    def add_biomes(self) -> list[tuple[ParameterPoint, str]]:
        self._entries.clear()
        # Java's `if (debugGenerateSquareTerrainWithoutNoise)` always false in
        # production; we always take the else branch.
        self._add_off_coast()
        self._add_inland()
        self._add_underground()
        return list(self._entries)

    def _add_off_coast(self) -> None:
        self._emit_surface(
            self.FULL_RANGE, self.FULL_RANGE, self.mushroomFieldsContinentalness,
            self.FULL_RANGE, self.FULL_RANGE, 0.0, B["MUSHROOM_FIELDS"],
        )
        for i in range(len(self.temperatures)):
            t = self.temperatures[i]
            self._emit_surface(
                t, self.FULL_RANGE, self.deepOceanContinentalness,
                self.FULL_RANGE, self.FULL_RANGE, 0.0, self.OCEANS[0][i],
            )
            self._emit_surface(
                t, self.FULL_RANGE, self.oceanContinentalness,
                self.FULL_RANGE, self.FULL_RANGE, 0.0, self.OCEANS[1][i],
            )

    def _add_inland(self) -> None:
        # OWB:228 — exactly this 13-call sequence over weirdness slices.
        self._add_mid_slice(Parameter.span_f(-1.0, -0.93333334))
        self._add_high_slice(Parameter.span_f(-0.93333334, -0.7666667))
        self._add_peaks(Parameter.span_f(-0.7666667, -0.56666666))
        self._add_high_slice(Parameter.span_f(-0.56666666, -0.4))
        self._add_mid_slice(Parameter.span_f(-0.4, -0.26666668))
        self._add_low_slice(Parameter.span_f(-0.26666668, -0.05))
        self._add_valleys(Parameter.span_f(-0.05, 0.05))
        self._add_low_slice(Parameter.span_f(0.05, 0.26666668))
        self._add_mid_slice(Parameter.span_f(0.26666668, 0.4))
        self._add_high_slice(Parameter.span_f(0.4, 0.56666666))
        self._add_peaks(Parameter.span_f(0.56666666, 0.7666667))
        self._add_high_slice(Parameter.span_f(0.7666667, 0.93333334))
        self._add_mid_slice(Parameter.span_f(0.93333334, 1.0))

    def _add_peaks(self, w: Parameter) -> None:
        for i in range(len(self.temperatures)):
            t = self.temperatures[i]
            for j in range(len(self.humidities)):
                h = self.humidities[j]
                rk = self._pick_middle(i, j, w)
                rk1 = self._pick_middle_or_badlands_if_hot(i, j, w)
                rk2 = self._pick_middle_or_badlands_if_hot_or_slope_if_cold(i, j, w)
                rk3 = self._pick_plateau(i, j, w)
                rk4 = self._pick_shattered(i, j, w)
                rk5 = self._maybe_pick_windswept_savanna(i, j, w, rk4)
                rk6 = self._pick_peak(i, j, w)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.farInlandContinentalness), self.erosions[0], w, 0.0, rk6)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.nearInlandContinentalness), self.erosions[1], w, 0.0, rk2)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[1], w, 0.0, rk6)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.nearInlandContinentalness), Parameter.span_p(self.erosions[2], self.erosions[3]), w, 0.0, rk)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[2], w, 0.0, rk3)
                self._emit_surface(t, h, self.midInlandContinentalness, self.erosions[3], w, 0.0, rk1)
                self._emit_surface(t, h, self.farInlandContinentalness, self.erosions[3], w, 0.0, rk3)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.farInlandContinentalness), self.erosions[4], w, 0.0, rk)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.nearInlandContinentalness), self.erosions[5], w, 0.0, rk5)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[5], w, 0.0, rk4)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.farInlandContinentalness), self.erosions[6], w, 0.0, rk)

    def _add_high_slice(self, w: Parameter) -> None:
        for i in range(len(self.temperatures)):
            t = self.temperatures[i]
            for j in range(len(self.humidities)):
                h = self.humidities[j]
                rk = self._pick_middle(i, j, w)
                rk1 = self._pick_middle_or_badlands_if_hot(i, j, w)
                rk2 = self._pick_middle_or_badlands_if_hot_or_slope_if_cold(i, j, w)
                rk3 = self._pick_plateau(i, j, w)
                rk4 = self._pick_shattered(i, j, w)
                rk5 = self._maybe_pick_windswept_savanna(i, j, w, rk)
                rk6 = self._pick_slope(i, j, w)
                rk7 = self._pick_peak(i, j, w)
                self._emit_surface(t, h, self.coastContinentalness, Parameter.span_p(self.erosions[0], self.erosions[1]), w, 0.0, rk)
                self._emit_surface(t, h, self.nearInlandContinentalness, self.erosions[0], w, 0.0, rk6)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[0], w, 0.0, rk7)
                self._emit_surface(t, h, self.nearInlandContinentalness, self.erosions[1], w, 0.0, rk2)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[1], w, 0.0, rk6)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.nearInlandContinentalness), Parameter.span_p(self.erosions[2], self.erosions[3]), w, 0.0, rk)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[2], w, 0.0, rk3)
                self._emit_surface(t, h, self.midInlandContinentalness, self.erosions[3], w, 0.0, rk1)
                self._emit_surface(t, h, self.farInlandContinentalness, self.erosions[3], w, 0.0, rk3)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.farInlandContinentalness), self.erosions[4], w, 0.0, rk)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.nearInlandContinentalness), self.erosions[5], w, 0.0, rk5)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[5], w, 0.0, rk4)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.farInlandContinentalness), self.erosions[6], w, 0.0, rk)

    def _add_mid_slice(self, w: Parameter) -> None:
        # OWB:477
        self._emit_surface(
            self.FULL_RANGE, self.FULL_RANGE, self.coastContinentalness,
            Parameter.span_p(self.erosions[0], self.erosions[2]), w, 0.0, B["STONY_SHORE"],
        )
        self._emit_surface(
            Parameter.span_p(self.temperatures[1], self.temperatures[2]),
            self.FULL_RANGE,
            Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness),
            self.erosions[6], w, 0.0, B["SWAMP"],
        )
        self._emit_surface(
            Parameter.span_p(self.temperatures[3], self.temperatures[4]),
            self.FULL_RANGE,
            Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness),
            self.erosions[6], w, 0.0, B["MANGROVE_SWAMP"],
        )
        for i in range(len(self.temperatures)):
            t = self.temperatures[i]
            for j in range(len(self.humidities)):
                h = self.humidities[j]
                rk = self._pick_middle(i, j, w)
                rk1 = self._pick_middle_or_badlands_if_hot(i, j, w)
                rk2 = self._pick_middle_or_badlands_if_hot_or_slope_if_cold(i, j, w)
                rk3 = self._pick_shattered(i, j, w)
                rk4 = self._pick_plateau(i, j, w)
                rk5 = self._pick_beach(i, j)
                rk6 = self._maybe_pick_windswept_savanna(i, j, w, rk)
                rk7 = self._pick_shattered_coast(i, j, w)
                rk8 = self._pick_slope(i, j, w)
                self._emit_surface(t, h, Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness), self.erosions[0], w, 0.0, rk8)
                self._emit_surface(t, h, Parameter.span_p(self.nearInlandContinentalness, self.midInlandContinentalness), self.erosions[1], w, 0.0, rk2)
                self._emit_surface(t, h, self.farInlandContinentalness, self.erosions[1], w, 0.0, (rk8 if i == 0 else rk4))
                self._emit_surface(t, h, self.nearInlandContinentalness, self.erosions[2], w, 0.0, rk)
                self._emit_surface(t, h, self.midInlandContinentalness, self.erosions[2], w, 0.0, rk1)
                self._emit_surface(t, h, self.farInlandContinentalness, self.erosions[2], w, 0.0, rk4)
                self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.nearInlandContinentalness), self.erosions[3], w, 0.0, rk)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[3], w, 0.0, rk1)
                if w.max < 0:
                    self._emit_surface(t, h, self.coastContinentalness, self.erosions[4], w, 0.0, rk5)
                    self._emit_surface(t, h, Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness), self.erosions[4], w, 0.0, rk)
                else:
                    self._emit_surface(t, h, Parameter.span_p(self.coastContinentalness, self.farInlandContinentalness), self.erosions[4], w, 0.0, rk)
                self._emit_surface(t, h, self.coastContinentalness, self.erosions[5], w, 0.0, rk7)
                self._emit_surface(t, h, self.nearInlandContinentalness, self.erosions[5], w, 0.0, rk6)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[5], w, 0.0, rk3)
                if w.max < 0:
                    self._emit_surface(t, h, self.coastContinentalness, self.erosions[6], w, 0.0, rk5)
                else:
                    self._emit_surface(t, h, self.coastContinentalness, self.erosions[6], w, 0.0, rk)
                if i == 0:
                    self._emit_surface(t, h, Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness), self.erosions[6], w, 0.0, rk)

    def _add_low_slice(self, w: Parameter) -> None:
        # OWB:651
        self._emit_surface(
            self.FULL_RANGE, self.FULL_RANGE, self.coastContinentalness,
            Parameter.span_p(self.erosions[0], self.erosions[2]), w, 0.0, B["STONY_SHORE"],
        )
        self._emit_surface(
            Parameter.span_p(self.temperatures[1], self.temperatures[2]),
            self.FULL_RANGE,
            Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness),
            self.erosions[6], w, 0.0, B["SWAMP"],
        )
        self._emit_surface(
            Parameter.span_p(self.temperatures[3], self.temperatures[4]),
            self.FULL_RANGE,
            Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness),
            self.erosions[6], w, 0.0, B["MANGROVE_SWAMP"],
        )
        for i in range(len(self.temperatures)):
            t = self.temperatures[i]
            for j in range(len(self.humidities)):
                h = self.humidities[j]
                rk = self._pick_middle(i, j, w)
                rk1 = self._pick_middle_or_badlands_if_hot(i, j, w)
                rk2 = self._pick_middle_or_badlands_if_hot_or_slope_if_cold(i, j, w)
                rk3 = self._pick_beach(i, j)
                rk4 = self._maybe_pick_windswept_savanna(i, j, w, rk)
                rk5 = self._pick_shattered_coast(i, j, w)
                self._emit_surface(t, h, self.nearInlandContinentalness, Parameter.span_p(self.erosions[0], self.erosions[1]), w, 0.0, rk1)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), Parameter.span_p(self.erosions[0], self.erosions[1]), w, 0.0, rk2)
                self._emit_surface(t, h, self.nearInlandContinentalness, Parameter.span_p(self.erosions[2], self.erosions[3]), w, 0.0, rk)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), Parameter.span_p(self.erosions[2], self.erosions[3]), w, 0.0, rk1)
                self._emit_surface(t, h, self.coastContinentalness, Parameter.span_p(self.erosions[3], self.erosions[4]), w, 0.0, rk3)
                self._emit_surface(t, h, Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness), self.erosions[4], w, 0.0, rk)
                self._emit_surface(t, h, self.coastContinentalness, self.erosions[5], w, 0.0, rk5)
                self._emit_surface(t, h, self.nearInlandContinentalness, self.erosions[5], w, 0.0, rk4)
                self._emit_surface(t, h, Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness), self.erosions[5], w, 0.0, rk)
                self._emit_surface(t, h, self.coastContinentalness, self.erosions[6], w, 0.0, rk3)
                if i == 0:
                    self._emit_surface(t, h, Parameter.span_p(self.nearInlandContinentalness, self.farInlandContinentalness), self.erosions[6], w, 0.0, rk)

    def _add_valleys(self, w: Parameter) -> None:
        # OWB:789
        self._emit_surface(self.FROZEN_RANGE, self.FULL_RANGE, self.coastContinentalness,
                          Parameter.span_p(self.erosions[0], self.erosions[1]), w, 0.0,
                          (B["STONY_SHORE"] if w.max < 0 else B["FROZEN_RIVER"]))
        self._emit_surface(self.UNFROZEN_RANGE, self.FULL_RANGE, self.coastContinentalness,
                          Parameter.span_p(self.erosions[0], self.erosions[1]), w, 0.0,
                          (B["STONY_SHORE"] if w.max < 0 else B["RIVER"]))
        self._emit_surface(self.FROZEN_RANGE, self.FULL_RANGE, self.nearInlandContinentalness,
                          Parameter.span_p(self.erosions[0], self.erosions[1]), w, 0.0, B["FROZEN_RIVER"])
        self._emit_surface(self.UNFROZEN_RANGE, self.FULL_RANGE, self.nearInlandContinentalness,
                          Parameter.span_p(self.erosions[0], self.erosions[1]), w, 0.0, B["RIVER"])
        self._emit_surface(self.FROZEN_RANGE, self.FULL_RANGE,
                          Parameter.span_p(self.coastContinentalness, self.farInlandContinentalness),
                          Parameter.span_p(self.erosions[2], self.erosions[5]), w, 0.0, B["FROZEN_RIVER"])
        self._emit_surface(self.UNFROZEN_RANGE, self.FULL_RANGE,
                          Parameter.span_p(self.coastContinentalness, self.farInlandContinentalness),
                          Parameter.span_p(self.erosions[2], self.erosions[5]), w, 0.0, B["RIVER"])
        self._emit_surface(self.FROZEN_RANGE, self.FULL_RANGE, self.coastContinentalness,
                          self.erosions[6], w, 0.0, B["FROZEN_RIVER"])
        self._emit_surface(self.UNFROZEN_RANGE, self.FULL_RANGE, self.coastContinentalness,
                          self.erosions[6], w, 0.0, B["RIVER"])
        self._emit_surface(
            Parameter.span_p(self.temperatures[1], self.temperatures[2]), self.FULL_RANGE,
            Parameter.span_p(self.inlandContinentalness, self.farInlandContinentalness),
            self.erosions[6], w, 0.0, B["SWAMP"],
        )
        self._emit_surface(
            Parameter.span_p(self.temperatures[3], self.temperatures[4]), self.FULL_RANGE,
            Parameter.span_p(self.inlandContinentalness, self.farInlandContinentalness),
            self.erosions[6], w, 0.0, B["MANGROVE_SWAMP"],
        )
        self._emit_surface(
            self.FROZEN_RANGE, self.FULL_RANGE,
            Parameter.span_p(self.inlandContinentalness, self.farInlandContinentalness),
            self.erosions[6], w, 0.0, B["FROZEN_RIVER"],
        )
        for i in range(len(self.temperatures)):
            t = self.temperatures[i]
            for j in range(len(self.humidities)):
                h = self.humidities[j]
                rk = self._pick_middle_or_badlands_if_hot(i, j, w)
                self._emit_surface(
                    t, h,
                    Parameter.span_p(self.midInlandContinentalness, self.farInlandContinentalness),
                    Parameter.span_p(self.erosions[0], self.erosions[1]), w, 0.0, rk,
                )

    def _add_underground(self) -> None:
        # OWB:905 — addUndergroundBiomes wrapper. Three caves entries.
        self._emit_underground(self.FULL_RANGE, self.FULL_RANGE,
                               Parameter.span_f(0.8, 1.0), self.FULL_RANGE,
                               self.FULL_RANGE, 0.0, B["DRIPSTONE_CAVES"])
        self._emit_underground(self.FULL_RANGE, Parameter.span_f(0.7, 1.0),
                               self.FULL_RANGE, self.FULL_RANGE,
                               self.FULL_RANGE, 0.0, B["LUSH_CAVES"])
        self._emit_bottom(self.FULL_RANGE, self.FULL_RANGE, self.FULL_RANGE,
                          Parameter.span_p(self.erosions[0], self.erosions[1]),
                          self.FULL_RANGE, 0.0, B["DEEP_DARK"])


# ---------------------------------------------------------------------------
# Tree -> uint64 binary layout. Cubiomes' format (see btree21wd.h header):
#   bits 0-7   : temperature param-index
#   bits 8-15  : humidity param-index
#   bits 16-23 : continentalness param-index
#   bits 24-31 : erosion param-index
#   bits 32-39 : depth param-index
#   bits 40-47 : weirdness param-index
#   bits 48-63 : 0xFF<biome> for leaves, else 16-bit child base index
#
# Cubiomes drops the 7th (offset) dimension at this stage. The param[] table
# is the deduplicated set of (min, max) pairs sorted ascending.
# ---------------------------------------------------------------------------


def tree_depth(node: TreeNode) -> int:
    """Max distance from this node to any leaf."""
    if isinstance(node, Leaf):
        return 0
    return 1 + max(tree_depth(c) for c in node.children)


def make_steps(leaf_depth: int, order: int = 6) -> list[int]:
    """Build the steps array. step[d] = full subtree size at depth d+1,
    where leaf_depth is the depth at which leaves live (== tree_depth(root))."""
    steps = [0] * (leaf_depth + 1)
    steps[leaf_depth] = 0  # leaves have no children to step through
    size = 1
    for d in range(leaf_depth - 1, -1, -1):
        steps[d] = size
        size = 1 + order * size
    return steps


def assign_indices(root: TreeNode) -> int:
    """Depth-first allocation. Side-effects: sets `_idx` and (for SubTrees)
    `_first_child_idx` on each node. Returns total node count."""
    counter = [0]

    def walk(node: TreeNode) -> None:
        node._idx = counter[0]  # type: ignore[attr-defined]
        counter[0] += 1
        if isinstance(node, SubTree):
            node._first_child_idx = counter[0]  # type: ignore[attr-defined]
            for c in node.children:
                walk(c)

    walk(root)
    return counter[0]


def collect_param_pairs(root: TreeNode) -> list[tuple[int, int]]:
    """Return the deduplicated, sorted list of (min, max) pairs over all
    nodes' parameter_space — only the first 6 dims (offset is dropped)."""
    pairs: set[tuple[int, int]] = set()

    def walk(node: TreeNode) -> None:
        for k in range(6):  # drop offset (dim 7)
            p = node.parameter_space[k]
            pairs.add((p.min, p.max))
        if isinstance(node, SubTree):
            for c in node.children:
                walk(c)

    walk(root)
    return sorted(pairs)


def encode_nodes(root: TreeNode, params: list[tuple[int, int]]) -> list[int]:
    """Emit the uint64[] array in DFS order."""
    pair_idx: dict[tuple[int, int], int] = {p: i for i, p in enumerate(params)}
    total = 0

    def count(node: TreeNode) -> None:
        nonlocal total
        total += 1
        if isinstance(node, SubTree):
            for c in node.children:
                count(c)

    count(root)
    out = [0] * total

    def emit(node: TreeNode) -> None:
        idx = node._idx  # type: ignore[attr-defined]
        # Pack 6 param indices into bits 0-47.
        word = 0
        for k in range(6):
            p = node.parameter_space[k]
            word |= pair_idx[(p.min, p.max)] << (8 * k)
        if isinstance(node, Leaf):
            biome_id = BIOME_ID[node.biome]
            word |= 0xFF << 56
            word |= biome_id << 48
        else:
            child_base = node._first_child_idx  # type: ignore[attr-defined]
            assert 0 <= child_base < (1 << 16), "child index overflows uint16"
            word |= child_base << 48
            for c in node.children:
                emit(c)
        out[idx] = word
        # Note: SubTree's children are emitted recursively above, before we
        # write the parent slot. That's fine — `out` is pre-allocated and we
        # write each slot exactly once.

    emit(root)
    return out


# ---------------------------------------------------------------------------
# Header file emission. Mirrors the format of cubiomes/tables/btree21wd.h.
# ---------------------------------------------------------------------------


def format_btree_h(
    name: str,
    version_label: str,
    steps: list[int],
    params: list[tuple[int, int]],
    nodes: list[int],
    order: int = 6,
) -> str:
    """Produce the full btreeNAME.h text matching the existing format.

    Existing format (from btree21wd.h):
      #include <inttypes.h>
      enum { btreeNAME_order = 6 };
      static const uint32_t btreeNAME_steps[] = { ..., 0 };
      static const int32_t btreeNAME_param[][2] =
      {
          {-12000,-10500},{-12000, -4550},...,// 00-03
          ...
      };
      static const uint64_t btreeNAME_nodes[] =
      {
          // <large explanatory comment block>
          0xAAAAAAAAAAAAAAAA,
          0xBB...,0xCC...,0xDD...,0xEE...,
          ...
      };
    """
    lines: list[str] = []
    lines.append("#include <inttypes.h>")
    lines.append("")
    lines.append(f"enum {{ {name}_order = {order} }};")
    lines.append("")
    steps_str = ", ".join(str(s) for s in steps)
    lines.append(f"static const uint32_t {name}_steps[] = {{ {steps_str} }};")
    lines.append("")
    lines.append(f"static const int32_t {name}_param[][2] =")
    lines.append("{")
    # Param table: 4 entries per line, with hex-offset comment after full lines.
    # Existing format: each pair is followed by a comma (including the final pair
    # in a partial last line); only full 4-entry lines get the "// HH-HH" comment.
    for i in range(0, len(params), 4):
        chunk = params[i:i + 4]
        parts = [f"{{{lo:6d},{hi:6d}}}" for lo, hi in chunk]
        line = "    " + ",".join(parts) + ","
        if len(chunk) == 4:
            line += f" // {i:02X}-{i + 3:02X}"
        lines.append(line)
    lines.append("};")
    lines.append("")
    lines.append(f"static const uint64_t {name}_nodes[] =")
    lines.append("{")
    # Standard explanatory comment block (mirrors btree21wd.h lines 48-61).
    lines.append(f"    // Binary encoded biome parameter search tree for {version_label}.")
    lines.append("    //")
    lines.append("    //   +-------------- If the top byte equals 0xFF, the node is a leaf and the")
    lines.append("    //   |               second byte is the biome id, otherwise the two bytes")
    lines.append("    //   |               are a short index to the first child node.")
    lines.append("    //   |")
    lines.append("    //   | +------------ Biome parameter index for 5 (weirdness)")
    lines.append("    //   | | +---------- Biome parameter index for 4 (depth)")
    lines.append("    //   | | | +-------- Biome parameter index for 3 (erosion)")
    lines.append("    //   | | | | +------ Biome parameter index for 2 (continentalness)")
    lines.append("    //   | | | | | +---- Biome parameter index for 1 (humidity)")
    lines.append("    //   | | | | | | +-- Biome parameter index for 0 (temperature)")
    lines.append("    //   | | | | | | |")
    lines.append("    //   v v v v v v v")
    # Node array: 4 entries per line, except the first line which is just node[0].
    # Looking at btree21wd.h: node[0] is on its own line, then 4-per-line groupings.
    # Existing format always ends each line with "," (including the last
    # partial line). The closing `};` is on its own line.
    lines.append(f"    0x{nodes[0]:016X},")
    for i in range(1, len(nodes), 4):
        chunk = nodes[i:i + 4]
        parts = [f"0x{n:016X}" for n in chunk]
        lines.append("    " + ",".join(parts) + ",")
    lines.append("};")
    # Match the existing files which end with "};\n\n" (a final blank line).
    return "\n".join(lines) + "\n\n"


VERSION_TO_TREE_NAME = {
    "1.21.4": ("btree21wd", "1.21 Winter Drop (24w40a)"),
    "1.21.5": ("btree21_5", "1.21.5 (Spring to Life)"),
}


def generate(version: str) -> tuple[str, str]:
    """Run the full pipeline for `version`. Returns (tree_name, header_text)."""
    name, label = VERSION_TO_TREE_NAME[version]
    builder = Builder(biome_data_for(version))
    entries = builder.add_biomes()
    tree = build_tree(entries)
    # Root bbox is never read by the consumer (only its first-child pointer is
    # consulted, then iteration descends into children whose own bboxes ARE
    # used). Existing cubiomes trees zero out the root's 6 param ranges; mirror
    # that so the binary layout is bit-exact. (See nptree_bin.py line 152.)
    if isinstance(tree, SubTree):
        zero = Parameter(0, 0)
        tree.parameter_space = [zero] * 6 + [tree.parameter_space[6]]
    total = assign_indices(tree)
    params = collect_param_pairs(tree)
    nodes = encode_nodes(tree, params)
    assert len(nodes) == total
    depth = tree_depth(tree)
    steps = make_steps(depth)
    print(f"[{version}] entries={len(entries)} params={len(params)} "
          f"nodes={total} depth={depth} steps={steps}", file=sys.stderr)
    return name, format_btree_h(name, label, steps, params, nodes)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("version", help="MC version, e.g. 1.21.4")
    parser.add_argument("--check", default=None,
                        help="diff against an existing btree*.h")
    parser.add_argument("-o", "--out", default=None, help="output path")
    parser.add_argument("--count-only", action="store_true",
                        help="just print the entry count for sanity-checking")
    args = parser.parse_args()

    if args.count_only:
        builder = Builder(biome_data_for(args.version))
        print(f"entries: {len(builder.add_biomes())}", file=sys.stderr)
        return 0

    _, text = generate(args.version)

    if args.check is not None:
        ref = Path(args.check).read_text()
        if ref == text:
            print("OK: bit-exact match", file=sys.stderr)
            return 0
        # Find first differing line for diagnostics.
        ref_lines = ref.splitlines()
        new_lines = text.splitlines()
        for i, (a, b) in enumerate(zip(ref_lines, new_lines), start=1):
            if a != b:
                print(f"DIFF at line {i}:", file=sys.stderr)
                print(f"  ref: {a!r}", file=sys.stderr)
                print(f"  new: {b!r}", file=sys.stderr)
                break
        else:
            if len(ref_lines) != len(new_lines):
                print(f"DIFF at length: ref={len(ref_lines)} new={len(new_lines)}",
                      file=sys.stderr)
        return 1

    if args.out:
        Path(args.out).write_text(text)
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
