const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

const DESKTOP_RUNTIME_CONTRACT_VERSION = 1
const REQUIRED_RUNTIME_CAPABILITIES = Object.freeze([
  'calendar-draft-handoff',
  'desktop-session-auth',
  'external-action-audit',
  'file-preview',
  'guided-work-packs',
  'resource-group-batch-assign',
  'resource-group-maintenance',
  'source-batch-download',
  'source-set-management',
  'task-thread-history',
])

function collectBackendInputs(backendDirectory) {
  const inputs = []
  const appDirectory = path.join(backendDirectory, 'app')

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__pycache__') visit(entryPath)
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        inputs.push(entryPath)
      }
    }
  }

  visit(appDirectory)
  for (const filename of ['desktop_entry.py', 'pyproject.toml', 'uv.lock']) {
    inputs.push(path.join(backendDirectory, filename))
  }
  return inputs.sort((left, right) => left.localeCompare(right))
}

function computeBackendBuildId(backendDirectory) {
  const root = path.resolve(backendDirectory)
  const hash = crypto.createHash('sha256')
  for (const inputPath of collectBackendInputs(root)) {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Backend build input is missing: ${inputPath}`)
    }
    const relativePath = path.relative(root, inputPath).replace(/\\/g, '/')
    hash.update(relativePath)
    hash.update('\0')
    hash.update(fs.readFileSync(inputPath))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function validateRuntimeHealth(payload) {
  if (!payload || typeof payload !== 'object' || payload.status !== 'healthy') {
    throw new Error('WorkerBee backend health response is missing or unhealthy.')
  }

  const runtime = payload.desktop_runtime
  if (!runtime || typeof runtime !== 'object') {
    throw new Error(
      'WorkerBee backend does not publish a desktop runtime contract. Rebuild the bundled backend.'
    )
  }
  if (runtime.contract_version !== DESKTOP_RUNTIME_CONTRACT_VERSION) {
    throw new Error(
      `WorkerBee backend contract ${runtime.contract_version ?? '(missing)'} is incompatible with ` +
      `desktop contract ${DESKTOP_RUNTIME_CONTRACT_VERSION}. Rebuild the bundled backend.`
    )
  }
  if (typeof runtime.build_id !== 'string' || !runtime.build_id.trim()) {
    throw new Error(
      'WorkerBee backend runtime contract is missing its build ID. Rebuild the bundled backend.'
    )
  }

  const capabilities = Array.isArray(runtime.capabilities) ? runtime.capabilities : []
  const capabilitySet = new Set(capabilities.filter((item) => typeof item === 'string'))
  const missing = REQUIRED_RUNTIME_CAPABILITIES.filter((capability) => !capabilitySet.has(capability))
  if (missing.length) {
    throw new Error(
      `WorkerBee backend is missing required desktop capabilities: ${missing.join(', ')}. ` +
      'Rebuild the bundled backend.'
    )
  }

  return {
    version: typeof payload.version === 'string' ? payload.version : 'unknown',
    contractVersion: runtime.contract_version,
    buildId: runtime.build_id,
    capabilities: [...capabilitySet].sort(),
  }
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => {
        if (port) resolve(port)
        else reject(new Error('Could not reserve a loopback port for runtime verification.'))
      })
    })
  })
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        if (body.length < 64 * 1024) body += chunk
      })
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`WorkerBee backend health returned HTTP ${response.statusCode || 'unknown'}.`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('WorkerBee backend health did not return valid JSON.'))
        }
      })
    })
    request.setTimeout(1_500, () => request.destroy(new Error('Health request timed out.')))
    request.once('error', reject)
  })
}

async function waitForCompatibleRuntime(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    let payload
    try {
      payload = await requestJson(url)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
      continue
    }
    // A reachable service with an incompatible contract is not a startup race.
    // Fail immediately so packaging never waits and then obscures a stale bundle.
    return validateRuntimeHealth(payload)
  }
  throw new Error(
    `The local WorkerBee service did not become compatible in time. ${lastError?.message || ''}`.trim()
  )
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

async function probeRuntimeExecutable(executablePath, timeoutMs = 45_000) {
  if (!fs.existsSync(executablePath)) {
    throw new Error(`WorkerBee backend executable was not found at ${executablePath}`)
  }

  const port = await reserveLoopbackPort()
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'workerbee-runtime-probe-'))
  const databasePath = path.join(temporaryDirectory, 'workerbee.db').replace(/\\/g, '/')
  let diagnostics = ''
  const child = spawn(executablePath, [], {
    cwd: temporaryDirectory,
    env: {
      ...process.env,
      WORKERBEE_BACKEND_PORT: String(port),
      DATABASE_URL: `sqlite+aiosqlite:///${databasePath}`,
      SECRET_KEY: 'workerbee-runtime-probe-only',
      CORS_ORIGINS: '["null"]',
      OPENCODE_API_BASE_URL: 'http://127.0.0.1:1',
      OPENCODE_PASSWORD: 'runtime-probe',
      OPENCODE_WORKSPACE_ROOT: temporaryDirectory,
      WORKERBEE_DESKTOP_MODE: 'true',
      WORKERBEE_DESKTOP_SESSION_SECRET: 'runtime-probe-session',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk) => {
    if (diagnostics.length < 8_000) diagnostics += chunk
  })

  try {
    const earlyExit = new Promise((_, reject) => {
      child.once('exit', (code, signal) => {
        reject(
          new Error(
            `WorkerBee backend exited during compatibility verification (${signal || code || 'unknown'}). ` +
            diagnostics.trim()
          )
        )
      })
    })
    return await Promise.race([
      waitForCompatibleRuntime(`http://127.0.0.1:${port}/health`, timeoutMs),
      earlyExit,
    ])
  } finally {
    await stopChild(child)
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

module.exports = {
  computeBackendBuildId,
  DESKTOP_RUNTIME_CONTRACT_VERSION,
  REQUIRED_RUNTIME_CAPABILITIES,
  probeRuntimeExecutable,
  validateRuntimeHealth,
  waitForCompatibleRuntime,
}
