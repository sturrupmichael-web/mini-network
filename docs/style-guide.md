# Nano Network — Visual Style Guide

**Reference:** Mini Motorways (Dinosaur Polo Club). Borrow the *approach*, not the assets: a flat pastel map, soft-shadowed toy-like pieces, and color as the only gameplay signal.

**One-line brief:** A pastel network diagram rendered as tactile, softly shadowed toy pieces. Color carries all meaning, and congestion is the only chaos.

---

## 1. Concept mapping

| Mini Motorways | Nano Network | Visual treatment |
|---|---|---|
| House | **Workstation** | Small rounded square, 1 tile, spawns with 2 parked packets |
| Destination building | **Server / Service** | Larger rounded rect (2×1 or 2×2), thin "rack unit" stripes |
| Car | **Packet** | Tiny pill in the source workstation's color |
| Road | **Cable** | Smooth rounded path on the grid, light with a soft shadow |
| Motorway | **Fiber backbone** | Wider, dark slate, stronger shadow (reads as elevated) |
| Bridge (over water) | **Firewall rule** (across a security zone) | Cable segment with small edge rails |
| Tunnel (through a mountain) | **Conduit** (through a wall/floor) | Cable fades to dashed while inside the zone |
| Roundabout | **Switch** | Circle; packets orbit and exit |
| Traffic light | **QoS / Load balancer** | Small 3-dot indicator at a junction |
| Demand pin | **Ticket** | Small circle stacked above a server |
| Timer ring | **SLA timer** | Ring around the server that fills clockwise |
| City | **Site** (Office, Campus, Datacenter…) | Each site has its own ground palette |

---

## 2. Color

### 2.1 Node palette (gameplay colors)
Soft but clearly distinct hues. Don't use neon, and don't use a pure primary color.

| Token | Day | Night |
|---|---|---|
| `red` | `#E2574C` | `#F06A5F` |
| `blue` | `#3E8ED0` | `#58A4E6` |
| `yellow` | `#F2B33D` | `#F7C55A` |
| `green` | `#4FAE6A` | `#66C381` |
| `purple` | `#8E6CC8` | `#A485DC` |
| `pink` | `#E77FA8` | `#F296BA` |
| `orange` | `#EE8A3C` | `#F79F55` |
| `teal` | `#2FAFA6` | `#47C4BA` |

Introduce colors in this order as the game progresses: blue → red → yellow → green → purple → teal → orange → pink. That way the first few colors are always the most distinguishable, including for colorblind players. Check with a simulator before shipping.

### 2.2 Site palettes (ground and terrain)

| Site | Ground | Security zone ("water") | Wall/floor zone ("mountain") | Cable | Backbone |
|---|---|---|---|---|---|
| HQ Office | `#EFE9DC` | `#BFD3DE` | `#E0D6C2` | `#FBFAF7` | `#4A5560` |
| Campus | `#E4EADB` | `#B7D0D6` | `#D3DCC6` | `#FBFCF8` | `#46544E` |
| Datacenter | `#E3E7EA` | `#C2CCE0` | `#D2D8DD` | `#FFFFFF` | `#3F4A57` |
| Night (any site) | `#1F2329` | `#25384A` | `#2A3038` | `#3A414B` | `#9AA6B2` |

### 2.3 Shadow color
- Day: `rgba(60, 48, 36, 0.18)` is a warm shadow. Never use pure black.
- Night: `rgba(0, 0, 0, 0.35)`.

---

## 3. Grid and scale
- **Tile:** 32 px at 1× (scale everything from `TILE`).
- Cables snap to tile centers and support **8 directions** (orthogonal and diagonal).
- The map starts at about **14×10 tiles** visible and expands outward over time (see Motion).

| Element | Size |
|---|---|
| Cable width | `0.42 × TILE` |
| Backbone width | `0.70 × TILE` |
| Workstation | `0.72 × TILE` square, corner radius `0.16 × TILE` |
| Server | `1.8 × 0.8 TILE` or `1.8 × 1.8 TILE`, radius `0.18 × TILE` |
| Packet | `0.36 × 0.22 TILE` pill (fully rounded) |
| Ticket pin | diameter `0.30 × TILE`, white center dot at 35% |
| SLA ring | radius = server half-diagonal + `0.35 × TILE`, stroke 3 px |
| Switch | diameter `1.6 × TILE`, ring width = cable width |

---

## 4. Shapes and depth

**Rules**
- No outlines, no textures, no gradients on gameplay pieces. Use flat fills only.
- Depth comes **only** from a soft drop shadow offset down and slightly right, so every piece looks like a paper cutout or plastic token lifted off the map.
- All corners are rounded, and line caps and joins are always round.

**Shadow tiers**

| Tier | Used for | Offset (x, y) | Blur |
|---|---|---|---|
| 0 | Ground, zones | none | none |
| 1 | Packets, pins | (0.5, 1) | 2 |
| 2 | Cables, workstations | (1, 2) | 4 |
| 3 | Servers, switches | (1.5, 3) | 6 |
| 4 | Backbone, firewall rules | (2, 5) | 9 |

**Pieces**
- **Workstation:** a solid node-color square with a small inset lighter rectangle (node color mixed 25% toward white) in the upper half, which hints at a monitor. That is the only detail.
- **Server:** a solid node-color rect with 2–3 thin horizontal stripes (node color mixed 18% toward white, 2 px tall), which suggest rack units.
- **Ticket pins:** they stack in a tidy row or arc above the server, never overlapping randomly.
- **Security zones:** they have smooth, slightly organic edges. Use rounded blobs here, not grid squares, so they read as terrain.
- **Firewall rule segment:** a cable at tier-4 shadow with two thin rails along its edges in the backbone color.

---

## 5. Motion
Gentle and toy-like. Nothing flashes except an SLA ring in danger.

| Event | Animation |
|---|---|
| Node spawns | scale 0 → 1.08 → 1.0, 280 ms, ease-out-back |
| Ticket appears | scale 0 → 1, 180 ms, plus a tiny 2 px upward settle |
| Cable placed | each tile segment snaps in over 80 ms (scale along length) |
| Cable removed | segment shrinks to its midpoint, 120 ms |
| Packet travel | constant speed (~3 tiles/s); ease in and out only at stops and junctions |
| Packet delivered | packet shrinks into the server, 150 ms; ticket pops off |
| SLA ring | fills clockwise; at 75%+ it pulses opacity 60% ↔ 100% at 1 Hz |
| Game over | time slows to 0, then the camera eases to frame the failed server, 1.2 s |
| Map expansion | the camera zooms out with ease-in-out over 1.5 s; new ground fades in |
| Weekly upgrade | the action pauses, the world dims to 70%, and cards rise in with a 60 ms stagger |

Congestion should be **visible**: packets queue bumper to bumper (0.08-tile gap) and visibly stall. That pile-up is the main tension signal, so don't hide it with effects.

---

## 6. UI
- **Font:** DM Sans (or a similar geometric sans) with tabular numerals for the score.
- **Score:** top-left. Show a packet icon and the delivered count in a 28 px medium weight.
- **Clock:** top-right. A small circle with 7 tick marks for days; a wedge fills through the week.
- **Toolbar:** bottom-center. Remaining cable tiles, backbones, switches and so on, each as a flat icon with a count badge.
- **Upgrade cards:** about 160×200 px, white (night: `#2A3038`), radius 12, tier-3 shadow. Each has one flat icon and a one-line label.
- UI chrome uses only neutrals, never node colors, so color always means gameplay.
- Keep the screen at least 85% map. Show no HUD panels or borders.

---

## 7. Rendering notes (Canvas 2D)

**Draw order**
1. Ground fill
2. Zones (security, wall/floor)
3. **Shadow pass:** every shadowed piece, drawn in shadow color at its offset
4. Cables → firewall segments → backbone
5. Switches
6. Workstations and servers
7. Packets
8. Ticket pins and SLA rings
9. UI

**Performance**
- Avoid per-frame `ctx.shadowBlur` on many objects. Pre-render shadowed sprites for nodes and packets to offscreen canvases, and draw cable shadows as a separate blurred stroke pass once per cable edit, cached to a layer canvas.
- Cables are drawn as one path through tile centers with `lineJoin = 'round'` and `lineCap = 'round'`, stroked twice: the shadow stroke, then the fill stroke.
- Cache static layers (ground, zones, cables) and redraw them only when they change. Redraw only packets, pins, rings and UI every frame.
- Render at `devicePixelRatio` for crisp edges.

---

## 8. Design tokens (drop-in)

```js
export const TILE = 32;

export const NODE = {
  day:   { blue:'#3E8ED0', red:'#E2574C', yellow:'#F2B33D', green:'#4FAE6A',
           purple:'#8E6CC8', teal:'#2FAFA6', orange:'#EE8A3C', pink:'#E77FA8' },
  night: { blue:'#58A4E6', red:'#F06A5F', yellow:'#F7C55A', green:'#66C381',
           purple:'#A485DC', teal:'#47C4BA', orange:'#F79F55', pink:'#F296BA' },
};
export const NODE_ORDER = ['blue','red','yellow','green','purple','teal','orange','pink'];

export const SITES = {
  office:     { ground:'#EFE9DC', secZone:'#BFD3DE', wallZone:'#E0D6C2', cable:'#FBFAF7', backbone:'#4A5560' },
  campus:     { ground:'#E4EADB', secZone:'#B7D0D6', wallZone:'#D3DCC6', cable:'#FBFCF8', backbone:'#46544E' },
  datacenter: { ground:'#E3E7EA', secZone:'#C2CCE0', wallZone:'#D2D8DD', cable:'#FFFFFF', backbone:'#3F4A57' },
  night:      { ground:'#1F2329', secZone:'#25384A', wallZone:'#2A3038', cable:'#3A414B', backbone:'#9AA6B2' },
};

export const SHADOW = {
  color: { day:'rgba(60,48,36,0.18)', night:'rgba(0,0,0,0.35)' },
  tier: [ null, {x:0.5,y:1,blur:2}, {x:1,y:2,blur:4}, {x:1.5,y:3,blur:6}, {x:2,y:5,blur:9} ],
};

export const SIZE = {
  cable: 0.42, backbone: 0.70, workstation: 0.72, wsRadius: 0.16,
  packet: { w:0.36, h:0.22 }, pin: 0.30, switch: 1.6,
}; // multiply by TILE

export const MOTION = {
  spawnMs: 280, pinMs: 180, cableSnapMs: 80, cableRemoveMs: 120,
  deliverMs: 150, gameOverMs: 1200, expandMs: 1500, cardStaggerMs: 60,
  packetTilesPerSec: 3, slaPulseAt: 0.75, queueGap: 0.08,
};
```

---

## 9. Do / Don't

**Do**
- Keep every piece flat, rounded and softly shadowed.
- Let color mean exactly one thing: which workstation group talks to which server.
- Let traffic jams look like traffic jams.
- Give each site its own ground palette, but keep shapes identical across sites.

**Don't**
- Use icons, logos or text labels on map pieces. Shape plus color is enough.
- Use outlines, gradients, glows or particle effects (except the SLA pulse).
- Copy Mini Motorways' actual assets, fonts, UI layouts or sounds. Use it as inspiration for the approach only.
- Put node colors in UI chrome.
