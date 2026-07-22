# WorkerBee desktop release checklist

## Native package contract

Desktop sidecars must be built on the operating system they will run on. PyInstaller
does not cross-compile, and the `opencode-ai` package installs a host-native engine.
The distribution scripts therefore stop when the requested target differs from the
host, and Electron Builder verifies the file format and CPU architecture again before
packaging. The backend also publishes a versioned desktop capability contract. Before
packaging, Electron Builder launches the exact bundled backend against a disposable
SQLite database and rejects missing, stale, or incompatible API capabilities. The
sidecar embeds a SHA-256 build ID over the packaged backend source and dependency lock;
the verifier also rejects a compatible binary built from older source.

| Host | Command | Deliverable | Admin access |
| --- | --- | --- | --- |
| macOS | `npm --prefix desktop run dist:mac` | ZIP and DMG | Not required |
| Windows | `npm --prefix desktop run dist:windows` | Per-user NSIS and portable EXE | Disabled |
| Linux | `npm --prefix desktop run dist:linux` | AppImage | Not required |

The repeatable native matrix lives in `.github/workflows/desktop-packages.yml`. It
installs locked dependencies, runs backend, desktop, and frontend checks, builds on
each native runner, and retains the packages as workflow artifacts.

## Release validation

1. Confirm backend API tests, desktop contract tests, frontend lint, and the desktop
   web build pass.
2. Confirm the runtime verifier reports both `workerbee-backend` and `opencode` with
   the same operating system and architecture as the package.
3. Confirm the backend API verifier reports the expected contract version, required
   capability count, and current source build ID. A health-only response without
   `desktop_runtime`, or a build ID that differs from the current backend, must fail.
4. Inspect the package contents for exactly the two expected sidecars and executable
   permissions on macOS/Linux.
5. Install or launch without an administrator account on a representative clean
   machine.
6. Confirm the application identity, Home, local workspace status, file picker,
   settings, one attached-file task, artifact download, and task revision flow.
7. Record artifact sizes and SHA-256 hashes.

## Before a public release

- Sign and notarize the macOS app and its bundled sidecars.
- Sign Windows executables to reduce SmartScreen friction.
- Sign or publish checksums for Linux AppImage artifacts.
- Add a signed update manifest and controlled rollout channel.
- Repeat smoke tests on the oldest supported OS versions and both supported CPU
  architectures before advertising them.
