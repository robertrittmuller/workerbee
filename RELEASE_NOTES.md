# WorkerBee 1.0.0

Released: July 21, 2026

WorkerBee 1.0 turns business requests and working files into useful, grounded, and
reviewable deliverables. The same outcome-focused workspace runs in a browser or as a
no-admin desktop app with local file access and a bundled private runtime.

## What ships

- Twelve guided workflows spanning spreadsheet cleanup, recurring KPI reporting,
  document briefs, decision support, research synthesis, proposal creation,
  presentations, project updates, and meeting follow-up.
- Deterministic multi-artifact output contracts, source-aware review guidance, explicit
  unsupported facts, and immutable task revisions.
- A polished Home, Work, Library, Activity, Assistants, and Settings experience with
  global search, previews, saved source sets, collections, and bounded batch export.
- Approval-gated email and tentative calendar draft handoffs. WorkerBee opens or
  downloads drafts only; it never sends a message, invites attendees, adds an event,
  or publishes content automatically.
- A browser deployment using FastAPI, PostgreSQL, Redis, MinIO, and OpenCode.
- A no-admin Electron app using a bundled loopback-only FastAPI runtime, SQLite,
  encrypted provider credentials, native open/save dialogs, and direct local-file
  access.

## Trust and safety boundaries

- The user reviews the exact request, attached filenames, and model destination before
  source content leaves the local workspace.
- External draft actions require explicit confirmation and are bound to the exact
  artifact. Audit records retain normalized routing metadata and a content hash, not
  the email body or calendar notes.
- The desktop renderer cannot ask the operating system to open arbitrary schemes for
  email or calendar actions; the main process independently validates structured data.
- The desktop UI and embedded backend share runtime contract version 1 with ten named
  capabilities and an exact source build fingerprint. Packaging fails on a stale or
  incompatible runtime.

## Release validation

- Backend: 69 tests passed.
- Frontend: 44 tests passed; ESLint and the TypeScript/Vite production build passed.
- Desktop: 29 tests passed.
- Live web and packaged macOS ARM64 checks covered the meeting-follow-up calendar
  review, approval state, exact RFC 5545 draft, mode-`0600` temporary storage,
  approved/opened audit events without notes, and cleanup on app quit.
- Native packaging verifies the backend architecture, API version, runtime contract,
  ten required capabilities, and current source fingerprint before producing artifacts.

## Distribution notes

Native sidecars must be built on their target operating system. The repository includes
the macOS, Windows per-user/portable, and Linux AppImage definitions plus a native CI
matrix. The macOS ARM64 artifacts produced in this workspace are unsigned because no
Developer ID certificate is installed; public distribution should add platform signing
and macOS notarization without changing the application payload.

### macOS ARM64 artifacts

- `WorkerBee-1.0.0-arm64-mac.zip` — 199,909,144 bytes — SHA-256
  `50244f78dbde483a2d0a2421b4bacd6c8168c6d4472666c1a48f38df84264261`
- `WorkerBee-1.0.0-arm64.dmg` — 201,798,537 bytes — SHA-256
  `42c0137baf290c97321f23612990275edaa195a1cc6996392f4410a304259350`
- Embedded backend source build: `43e7b344b61f`
