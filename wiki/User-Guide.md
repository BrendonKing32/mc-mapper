# User Guide

## Generating a map

1. Type a **Seed**. Numbers are read as signed 64-bit integers (like the game); anything else is text and is hashed with Java's `String.hashCode`, exactly as the game does for text seeds. So `hello` and its hash `99162322` give the same world.
2. Pick an **Edition** (Java or Bedrock) and **Version**. Pick the version the world was *created* in: generation changed a lot between versions (1.18 especially).
3. Pick a **Dimension**: Overworld, Nether or End.
4. Optionally tick **Large biomes** (Java's "Large Biomes" world type).
5. Press **Generate**.

On Bedrock a note appears under the form explaining which parts are approximate; see [[Accuracy and Limitations]].

The current seed, edition, version and dimension are written into the page URL (`?seed=…&edition=…&version=…&dimension=…`), so you can bookmark or share a map link.

## Moving around

| Action | Mouse | Touch |
|---|---|---|
| Pan | drag | one-finger drag |
| Zoom | scroll wheel (zooms around the cursor) | pinch, or the **+ / −** buttons |
| Select a structure or pin | click it | tap it |
| Drop a pin | right-click the map | tap 📍 then tap the map |
| Cancel pin mode / close menu | `Esc` | ✕ |

The HUD at the bottom shows the block coordinates and biome under the cursor, plus status messages ("Generating…", "Zoom in to see structures").

The **X / Z / Go** box jumps to a coordinate, and **Spawn** returns to world spawn (Overworld only). Spawn is drawn as a red dot and the origin (0, 0) as a small white cross.

On phones the map fills the screen and the sidebar slides in from the **☰** button.

## Structures

The **Structures** section lists every supported structure, grouped by dimension. Ticking one shows it on the map as an emoji marker. By default villages, pillager outposts, woodland mansions, ocean monuments, strongholds, Nether fortresses, bastions and End cities are on. Structures from other dimensions than the one on the map are dimmed.

Structures are only searched when the view is less than ~24,000 blocks wide; zoom in if you see "Zoom in to see structures".

Clicking a structure opens a popup with:
- its coordinates and a ready-to-paste `/tp @s X ~ Z` command,
- **Nether portal coords** (or **Overworld portal coords** for Nether structures), which fills in the portal calculator and offers a **Show in …** button,
- **Mark visited** (only when the seed is saved).

Structures marked **≈** in the filter list are approximate on Bedrock (see [[Bedrock Support]]).

## Biome filter

Open **Biome filter**, tick one or more biomes, and every other biome is greyed out, which makes it easy to find e.g. the nearest Mushroom Fields or Cherry Grove. Use the search box to narrow the list and **Clear** to reset. Cave biomes (Lush Caves, Dripstone Caves, Deep Dark) are not listed because the map shows surface biomes only.

## Saved seeds

**Save seed** stores the current seed, edition, version and dimension under a name you choose. The **Saved seeds** list lets you load (click), rename (✎) or delete (✕) them.

Saved seeds are stored **in this browser only**. Nobody else can see them, but they don't sync between browsers or devices, and clearing site data deletes them. Use **Export** to download `mc-mapper-seeds.json` and **Import** on another browser to load it; importing merges and skips seeds you already have. If the browser refuses to save (storage full, disabled, private mode), the reason is shown in the sidebar.

A saved seed covers all three dimensions: notes, visited structures and pins are shared, and pins remember which dimension they belong to.

## Notes, visited structures and pins

These all need the seed on the map to be saved first.

- **Notes**: a free-text box (up to 5,000 characters) that saves as you type.
- **Visited**: click a structure → **Mark visited**. Visited structures get a green check and are drawn faded. **Hide visited** removes them from the map.
- **Pins**: right-click the map, or tap 📍 then the map, and give the pin a name. Click a pin for its coordinates, `/tp` command and portal coordinates, or to rename/remove it. The **Pins** list in the sidebar jumps to any pin, switching dimension if needed.

## Nether portal calculator

Type Overworld or Nether X/Z and the other side fills in. X and Z scale by 8 (Overworld ÷ 8 → Nether, rounded *down* like the game, so negatives round away from zero); Y stays the same.

- **Use map center** fills the calculator from the middle of the map.
- **Show Overworld / Show Nether** jumps the map to that spot, switching dimension if needed.

Tip: build the portal at the calculated spot. The game links to any existing portal within 128 blocks in the Overworld or 16 in the Nether, so a nearby portal can steal the link.

## What's new

The **What's new** button lists recent changes. A dot on it (and on ☰ on phones) means something changed since you last opened it. First-time visitors start caught up.
