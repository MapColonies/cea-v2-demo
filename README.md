# CEA v2 — Coordinate Extraction Approval Demo

A demo approval workflow for MapColonies photorealistic 3D Tiles models.
Approvers review and sign off on model sub-tiles (coordinate extraction areas) through a split 2D/3D workspace.
All approvals are **browser-local** and have no operational effect on MapColonies or any production system.

---

## What it does

- Loads the real MapColonies 3D catalogue (CSW GetRecords) for Prod / Int / Dev environments
- Splits each model into a deterministic grid of sub-tiles clipped to the model footprint with realistic non-rectangular polygon shapes
- Lets approvers review tiles in a **2D Leaflet map** (orthophoto basemap) and a **photorealistic 3D Tiles viewer** (Three.js / 3d-tiles-renderer)
- Tracks approval state per tile in `localStorage` — no backend writes
- Protects the save flow with an approver name + admin password step (demo: any password accepted)
- Remembers 3D camera position per tileset when switching between views
- Fullscreen 3D view available from within any model's approval workspace

---

## Stack

| Layer | Library |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| 2D map | React-Leaflet |
| 3D engine | Three.js + 3d-tiles-renderer |
| Auth / DB | Supabase (auth only; approvals are browser-local) |
| Build | Vite + SWC |

---

## Getting started

### Prerequisites

- Node.js ≥ 18 (or Bun)
- MapColonies VPN access
- MapColonies JWT tokens for the environments you want to use

### Install

```sh
git clone https://github.com/MapColonies/cea-v2-demo.git
cd cea-v2-demo
npm install
```

### Environment variables

Copy `.env.example` to `.env` (or create `.env`) and fill in your tokens:

```env
# Supabase (required for auth)
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# MapColonies JWT tokens — Prod token is the fallback for Int/Dev if not set
VITE_MAPCOLONIES_TOKEN=<prod-token>
VITE_MAPCOLONIES_TOKEN_INT=<int-token>
VITE_MAPCOLONIES_TOKEN_DEV=<dev-token>
```

> Tokens are injected into catalogue and tile requests by the Vite dev-server proxy.
> The browser never talks directly to `*.mapcolonies.net` — all requests go through `localhost:8080/proxy/*`.

### Run

```sh
npm run dev
# → http://localhost:8080
```

### Build

```sh
npm run build        # outputs to dist/
npm run preview      # serve dist/ locally
```

---

## Architecture

### Vite proxy (dev only)

All MapColonies traffic is routed through Vite's dev-server proxy to avoid CORS:

| Proxy path | Target |
|---|---|
| `/proxy/catalog-prod` | `https://catalog.mapcolonies.net` + token injected |
| `/proxy/catalog-int` | `https://catalog-int.mapcolonies.net` + token injected |
| `/proxy/catalog-dev` | `https://catalog-dev.mapcolonies.net` + token injected |
| `/proxy/tiles-prod` | `https://tiles.mapcolonies.net` |
| `/proxy/tiles-int` | `https://tiles-int.mapcolonies.net` |
| `/proxy/tiles-dev` | `https://tiles-dev.mapcolonies.net` |

Tile requests get tokens added client-side via `tokenizedUrl()` before hitting the proxy.

### Sub-tile generation (`src/lib/demo/realModels.ts`)

Each catalogue record is split into a grid sized to ~16–36 roughly-square cells:

1. Interior grid vertices are perturbed deterministically (up to 30% of cell size, seeded by record ID + grid position)
2. Edge midpoints of each polygon are shared between adjacent tiles (same seed) so there are no gaps
3. Cells partially outside the record footprint are clipped to the footprint using Sutherland-Hodgman
4. Cells entirely outside the footprint are dropped

### Camera memory (`src/lib/mapcolonies/cameraStore.ts`)

Camera position is saved per `tilesetUrl` on `TilesRenderer` unmount and restored on mount.
Switching between the embedded 3D panel and fullscreen preserves the exact viewpoint.

---

## Project structure

```
src/
  components/
    map/              # 2D Leaflet map, SubtileMap, ModelMap, overlays
    mapcolonies/      # 3D viewer (Tiles3DView), RealModel3DView, catalog
    models/           # Approval flow, model list, metadata
  hooks/              # useRealModels, useMapColoniesCatalog, useAuth
  lib/
    cea/              # Approval rules, spatial helpers
    demo/             # Sub-tile generation, demo approval store
    mapcolonies/      # CSW client, token handling, environment store
  pages/
    Dashboard.tsx     # Main shell
```

---

## Notes

- **Demo mode**: approvals are stored in `localStorage`. Clearing browser data resets all approvals.
- **VPN required**: catalogue and tile servers are not publicly accessible.
- **Environment switcher**: top-right of the Dashboard; switches catalogue + token without page reload.
- **Tile errors**: 404s on first load are normal — MapColonies generates tiles on demand. The viewer auto-retries once after 4 s.
