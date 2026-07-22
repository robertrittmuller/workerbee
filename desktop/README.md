# WorkerBee Desktop

The desktop app wraps the shared React UI in a locked-down Electron renderer and
starts the FastAPI backend as a private loopback sidecar. Local metadata uses SQLite
and user files live under the operating system's per-user application-data directory.
The platform-specific OpenCode execution engine is pinned and bundled alongside the
backend; Electron starts it on an authenticated random loopback port for local runs.

The renderer can display but cannot read stored model credentials. OpenAI and
Anthropic keys are encrypted by Electron's operating-system credential protection in
the main process, then injected only into the isolated execution-engine process after
an explicit save-and-restart. If secure credential storage is unavailable, bring-your-
own-key controls stay disabled and included model access remains available.

Before each task, WorkerBee can show the exact request, attached filenames, and model
service that will receive the content. The review preference and external-processing
acknowledgement are controlled in **Settings → Trust, data, and models**.

## Development

```bash
cd frontend && npm install
cd ../desktop && npm install
npm run dev
```

The development command starts Vite, launches the local SQLite API through `uv`, and
opens Electron. No Docker services are required.

## Packaging

```bash
npm run pack
```

This builds the desktop-targeted web bundle, creates a single-file backend sidecar,
copies the pinned platform execution engine, and assembles an unpacked application
for the current platform.

Distribution targets are `dist:mac`, `dist:windows`, and `dist:linux`. The Windows
installer is configured per-user with elevation disabled; the portable Windows build,
macOS ZIP, and Linux AppImage can run without an administrator-level installation.

The generated runtime binary and release artifacts are intentionally ignored by Git.

## Verification

```bash
npm test
npm run build:web
```

The unit tests cover encrypted credential persistence, redaction from renderer-facing
responses, provider-specific environment isolation, model validation, and removal of
saved credentials when returning to included access.
