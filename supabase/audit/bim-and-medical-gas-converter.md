# BIM and Medical-Gas Converter Implementation Notes

## Scope

- `3D Model & AR` remains its own project module. It stores GLB/glTF and optional USDZ files in a private `project-models` Storage bucket, keeps model/version/component manifest metadata in PostgreSQL, and maps named GLB nodes to existing WBS and optional Activity records.
- `2D to 3D Converter` is a separate companion module. It accepts PNG/JPG, PDF, and ASCII DXF input; draws/reads candidate routes; requires explicit gas classification and user verification; then builds only verified pipe meshes for the 3D viewer and GLB/OBJ/PNG export.
- Neither module changes the existing Weekly Progress or S-Curve source of truth. WBS progress and the current project S-Curve appear read-only in BIM/converter details.

## Repository audit findings (source-level)

The app is React 18 + TypeScript + Vite with `HashRouter`; module selection is the `Page` state and sidebar list in `src/main.tsx`. Supabase is accessed by `src/services/supabase.ts` using the publishable browser key. The live database and Storage catalog were not accessible to this audit.

The current app code expects these existing tables and columns/relations:

| Table | Source-side fields used by app | Relationship |
|---|---|---|
| `projects` | `id`, `owner_id`, `project_name`, `project_code`, `client`, `location`, `project_manager`, `engineer`, `contractor`, `consultant`, `start_date`, `end_date`, `contract_value`, `status`, `description`, `logo`, `archived`, `approval`, `berita_acara`, `documentation` | Project owner is `owner_id` (presence was reported by user after their migration; not independently queried here). |
| `wbs` | `id`, `project_id`, `wbs_code`, `wbs_name`, `parent_id`, `description`, `discipline`, `unit`, `quantity`, `weight`, dates, planned/actual progress, status, PIC, notes | WBS row belongs to a project. |
| `activities` | `id`, `project_id`, `wbs_id`, `activity_code`, `activity_name`, dates, duration, weight, planned/actual progress, status, PIC, notes | Activity links to an existing WBS through `wbs_id`. |
| `weekly_progress` | `id`, `project_id`, `week_number`, `week_start`, `week_end`, `wbs_id`, `activity_id`, `planned_progress`, `actual_progress`, `variance`, notes | Entries are incremental per-week; S-Curve cumulatively sums existing weekly progress values. Multiple WBS links may also use the existing compatibility marker/junction migration. |
| `issues` | `id`, `project_id`, issue code/title/description, reported/due dates, priority, status, assignee, action, notes | No WBS/activity FK in current app mapping. |
| `materials` | `id`, `project_id`, material code/name/specification/quantity/unit, required/delivery dates, approval/procurement status, supplier, notes | No WBS/activity FK in current app mapping. |

These are code expectations, not live schema verification. The repository has no base schema migration. Existing audit notes report RLS enabled and say the user ran the owner-policy migration, but full policy definitions, Storage buckets/policies, FK delete behavior, and ordinary-user RLS tests remain unverified in this environment.

## Implementation and known limits

- `src/components/MedicalGasConverter.tsx` supports raster image plans, PDF rendering (one selected page at a time), and DXF `LINE`/`LWPOLYLINE` entities. DXF `ARC`, `CIRCLE`, `SPLINE`, `INSERT`, legacy `POLYLINE`, and other unsupported entities are reported and left out; block inserts are not expanded.
- Raster/PDF routes are traced by the user. DXF line entities become gray candidates. The app does not guess gas type from color/layer text. Every route starts unverified; unverified or unclassified routes are excluded from the 3D scene and exports.
- Pipe positions retain plan proportions. Scale, diameter, and elevation are visual/editable settings without calibration. Fittings are not claimed as actual identified fittings; the viewer draws simple metal cylinders and generic bend joints. Reducers, couplings, and tee details require review/explicit geometry input.
- DXF input means ASCII `.dxf`; `.dwg` must first be exported from AutoCAD to DXF or PDF. glTF BIM uploads must be self-contained (embedded resources); GLB is preferred.
- BIM node selection is through the named component list, not direct mesh ray-picking. `model-viewer` does not expose a general-purpose scene graph for this. Node paths use names; unnamed components include exporter node indexes and may change on re-export. A merged single mesh cannot be subdivided reliably.
- Issue and material counts in BIM are project-level context, not component-specific, because current source mappings do not link those tables to WBS/components.
- Due npm registry DNS failure (`ENOTFOUND`), 3D/PDF libraries are loaded lazily from pinned jsDelivr URLs. This keeps the local Vite build working, but viewing/export/PDF rendering require a browser network connection to jsDelivr. If deployment CSP restricts `script-src`/`connect-src`, allow those pinned URLs or vendor the packages in a later network-enabled build.
- AR support depends on compatible device/browser, HTTPS, and (for iOS Quick Look) an optional USDZ file. It was not tested on a physical Android/iOS device here.

## BIM migration

[`20261119000000_bim_models_and_wbs_mappings.sql`](../migrations/20261119000000_bim_models_and_wbs_mappings.sql) is a guarded, additive migration. It creates `project_models`, `model_wbs_mappings`, a private bucket, and owner-scoped metadata/Storage policies. It checks required UUID columns and aborts on existing tables, a public named bucket, or a potential broad anonymous Storage policy.

The migration was **not run**. Before running it in Supabase SQL Editor, verify actual source column types/FKs, inspect all Storage buckets and `storage.objects` policies, review each guard, and test with ordinary authenticated accounts. Do not run it if a same-named table/bucket exists without adapting the script. Project metadata deletion cascades in PostgreSQL, but stored objects would need a separate cleanup workflow if projects are deleted.

## Verification

- Baseline production build before these changes: passed.
- Production build after implementation: passed with lazy chunks for the two new modules.
- `package.json` has no lint or test script; no test suite was available.
- No live Supabase query or migration was run. No model asset was supplied, so GLB hierarchy parsing and model rendering could not be exercised with the project's actual file.
- Manual follow-up still needed: test a real DXF with blocks/arcs, a multi-page PDF, GLB with multiple named meshes, expired signed URLs, authorized/unauthorized accounts, and AR on Android/iOS.
