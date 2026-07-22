const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  computeBackendBuildId,
  DESKTOP_RUNTIME_CONTRACT_VERSION,
  REQUIRED_RUNTIME_CAPABILITIES,
  validateRuntimeHealth,
} = require('../scripts/runtime-compatibility.cjs')

function compatibleHealth(overrides = {}) {
  return {
    status: 'healthy',
    version: '0.1.0',
    desktop_runtime: {
      contract_version: DESKTOP_RUNTIME_CONTRACT_VERSION,
      build_id: 'a'.repeat(64),
      capabilities: [...REQUIRED_RUNTIME_CAPABILITIES],
    },
    ...overrides,
  }
}

test('accepts a healthy backend with every required desktop capability', () => {
  const result = validateRuntimeHealth(compatibleHealth())

  assert.equal(result.version, '0.1.0')
  assert.equal(result.contractVersion, DESKTOP_RUNTIME_CONTRACT_VERSION)
  assert.equal(result.buildId, 'a'.repeat(64))
  assert.deepEqual(result.capabilities, [...REQUIRED_RUNTIME_CAPABILITIES].sort())
})

test('rejects a stale backend that does not publish a runtime contract', () => {
  assert.throws(
    () => validateRuntimeHealth({ status: 'healthy', version: '0.1.0' }),
    /does not publish a desktop runtime contract/
  )
})

test('rejects an incompatible contract version', () => {
  const health = compatibleHealth()
  health.desktop_runtime.contract_version += 1

  assert.throws(() => validateRuntimeHealth(health), /contract 2 is incompatible/)
})

test('names every missing capability so a stale sidecar is diagnosable', () => {
  const health = compatibleHealth()
  health.desktop_runtime.capabilities = ['desktop-session-auth']

  assert.throws(
    () => validateRuntimeHealth(health),
    /missing required desktop capabilities: calendar-draft-handoff, external-action-audit, file-preview/
  )
})

test('rejects a runtime contract without an embedded build ID', () => {
  const health = compatibleHealth()
  delete health.desktop_runtime.build_id

  assert.throws(() => validateRuntimeHealth(health), /missing its build ID/)
})

test('backend build IDs are deterministic and change with packaged source inputs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workerbee-build-id-test-'))
  try {
    fs.mkdirSync(path.join(directory, 'app'))
    fs.writeFileSync(path.join(directory, 'app', 'main.py'), 'VALUE = 1\n')
    fs.writeFileSync(path.join(directory, 'desktop_entry.py'), 'from app.main import VALUE\n')
    fs.writeFileSync(path.join(directory, 'pyproject.toml'), '[project]\nname="test"\n')
    fs.writeFileSync(path.join(directory, 'uv.lock'), 'version = 1\n')

    const first = computeBackendBuildId(directory)
    assert.equal(first, computeBackendBuildId(directory))
    fs.writeFileSync(path.join(directory, 'app', 'main.py'), 'VALUE = 2\n')
    assert.notEqual(first, computeBackendBuildId(directory))
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
