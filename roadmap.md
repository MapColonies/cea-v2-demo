# CEA v2 upgrade

- [x] Demo approvals on real MapColonies models: approval workflow is home again, catalogue = real 3D Tiles records with generated sub-tile grids, browser-local demo approvals; sub-tiles draped and selectable on real 3D; 3D navigation controls; per-tile load diagnostics. 72 tests pass; draping/picking/navigation verified on a local tileset. Live tiles to verify on VPN.

- [x] MapColonies 3D catalogue view: CSW GetRecords (paged), 3D Tiles/all filter, footprints on 2D map, real photorealistic 3D Tiles viewer with WGS84/Israel grid/ellipsoidal-height readout; 7 new tests, local tileset render verified. Live catalogue/tiles must be verified on VPN (CORS for the app origin).

- [x] Add orthophoto background, remove capture-date filtering, rename statuses without changing protections, and visibly identify map-selected subtiles; 33 tests pass, authenticated browser confirms loaded imagery and exact focused list entry without runtime errors.
- [ ] Connect MapColonies catalogue and real 3D tiles through the user-selected organizational HTTPS gateway over desktop VPN, not a local bridge. Blocked on infrastructure team's gateway URL, authentication method, allowed app origins and catalogue/tile paths; existing Cloud proxy cannot reach the provider.

- [x] Allow administrators to restore rejected models to any valid approval state through the protected save flow; subset rules and restore-plus-approve payload tested, all four choices verified in signed-in UI.
- [x] Confirm successful saving on the last screen for five seconds before returning home with a cleared approval session; delayed callback regression passes. Live save verification remains blocked by the original-session/password requirements below.

- [x] Move reference shapefile upload outside the map below and left-aligned with model status; nine regression tests pass, signed-in upload completes, and screenshot verifies position. Shared reference data is passed to both renderers.

- [x] Compact catalog coordinate search, collapse/toggle model metadata without clearing selection, and place elevation entry at the map's top edge; five tests and signed-in browser interactions pass without runtime errors.

- [x] Add WGS84GEO/UTM zone lookup, inclusive accuracy ranges and eight-digit subtile annotations; 198 identifiers checked for global uniqueness and format.
- [x] Add protected, audited model rejection cancelling approvals, restoration and exact four catalog filters; rule/staging regressions pass.
- [x] Add local shapefile references and checked catalog subtile rendering in 2D/3D synthetic mesh; signed-in browser confirms upload, 17 map polygons and nonblank mesh without errors.
- [x] Return home after successful save; protected-save callback tested. Live authenticated rejection/restoration/save still requires a valid original approval session and administrator password (blockers below).

- [x] Keep catalog eye preview inline with preserved filters/selection and 2D/3D switching; signed-in eye/switch/Next flow verified.
- [x] Remove quality filtering; show cumulative approval/revocation deltas with individual undo across filters; regression test verifies two filters and individual undo.
- [x] Show only touching neighboring models, all their subtiles, in soft approved/unapproved shades with dashed outlines; 14 tests pass and signed-in 2D/3D neighbor rendering verified.

- [x] Require fresh approver name and administrator password for every save, including Google sessions; 8 regression tests pass and preview loads. Full save remains blocked by the existing injected sign-in session limitation below.

- [x] Catalog eye opens full-screen read-only synthetic 3D with bottom-right metadata at one-third screen height, then continues to polygon selection and existing approval steps; 7 tests pass, signed-in preview/handoff and desktop/mobile rendering verified without runtime errors.

- [x] Selected-polygon approval acquires the protected edit lock on demand; 3 regression tests pass and signed-in interaction confirms the button works and reports invalid approval sign-in

- [x] Fix administrator detection for accounts holding both viewer and admin; 3 regression tests pass and signed-in UI shows administrator/edit controls

- [x] Google sign-in and passwordless approval for authenticated administrators; provider enabled and verification deployed
- [x] Google approval evidence tests (4) and existing rule tests (12); sign-in button visible without runtime errors
- [x] Link the requesting user's signed-in Google account to administrator permissions; server role check confirmed
- [ ] Verify final save through an original Google OAuth session — injected and self-minted sessions lack session_id and are rejected by edit-lock RPC; requires the user to sign out and sign back in with Google

- [x] Stabilize React dependency prebundling; signed-in workspace, collapse, resize and 3D verified without runtime errors

- [x] Expanded resizable/collapsible map workspace and compact side-panel history
- [x] Stable camera during selection, cyan outlines and selected legend
- [x] Verify initial framing and selection stability in 2D/3D

- [x] Refined colors, bidirectional selection/hover, text-only clipped zoom annotations and legend
- [x] Visible unapproved bulk selection and contiguous demo seeds (3 models, 16 sub-tiles each)
- [x] 17 tests; signed-in map/list selection, reference 3D and mesh XYZ checked

- [x] Country catalog, partial counters, radius filters and reference selection
- [x] Read-only reference sub-tiles, annotations and coordinate navigation
- [x] Explicit synthetic 3D demo with mesh-sampled elevation (no real WFS source requested)
- [x] Server-enforced approval sessions and exclusive edit locks
- [x] Atomic approvals and catalog deletion/unpublish protection
- [x] 12 rule tests and signed-in viewer catalog/map/demo verification
- [ ] Administrator password-to-save end-to-end verification — requires signing into an individual administrator account