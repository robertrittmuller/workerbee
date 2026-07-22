const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  buildAgentEnvironment,
  buildAgentModelConfiguration,
  hasSecureStorage,
  publicModelConnection,
  readModelConnection,
  saveModelConnection,
} = require('../src/model-settings.cjs')

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf8'),
  decryptString: (value) => value.toString('utf8').replace(/^sealed:/, ''),
}

function withTemporaryDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workerbee-model-settings-'))
  try {
    run(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('stores provider credentials encrypted and never returns the key publicly', () => {
  withTemporaryDirectory((directory) => {
    const saved = saveModelConnection(directory, fakeSafeStorage, {
      provider: 'openai',
      model: 'openai/gpt-5',
      apiKey: 'sk-test-secret-1234',
    })
    const storedText = fs.readFileSync(path.join(directory, 'model-connection.json'), 'utf8')
    assert.equal(storedText.includes('sk-test-secret-1234'), false)
    assert.equal(saved.keyLast4, '1234')

    const publicSettings = publicModelConnection(saved, fakeSafeStorage)
    assert.equal('apiKey' in publicSettings, false)
    assert.equal(publicSettings.keyLast4, '1234')
  })
})

test('loads credentials and maps them only to the selected provider process', () => {
  withTemporaryDirectory((directory) => {
    saveModelConnection(directory, fakeSafeStorage, {
      provider: 'anthropic',
      model: 'anthropic/claude-sonnet-4-5',
      apiKey: 'anthropic-test-5678',
    })
    const loaded = readModelConnection(directory, fakeSafeStorage)
    assert.deepEqual(buildAgentEnvironment(loaded), {
      ANTHROPIC_API_KEY: 'anthropic-test-5678',
    })
    assert.equal(buildAgentModelConfiguration(loaded).model, 'anthropic/claude-sonnet-4-5')
    assert.deepEqual(buildAgentModelConfiguration(loaded).enabled_providers, ['anthropic'])
  })
})

test('retains an existing key when changing only the model and removes it for included access', () => {
  withTemporaryDirectory((directory) => {
    saveModelConnection(directory, fakeSafeStorage, {
      provider: 'openai',
      model: 'openai/gpt-5',
      apiKey: 'sk-keep-2468',
    })
    const updated = saveModelConnection(directory, fakeSafeStorage, {
      provider: 'openai',
      model: 'openai/gpt-5-mini',
      apiKey: '',
    })
    assert.equal(updated.apiKey, 'sk-keep-2468')
    assert.equal(updated.model, 'openai/gpt-5-mini')

    const included = saveModelConnection(directory, fakeSafeStorage, { provider: 'included' })
    assert.equal(included.configured, false)
    assert.equal(fs.existsSync(path.join(directory, 'model-connection.json')), false)
  })
})

test('rejects invalid model IDs and unavailable secure storage', () => {
  withTemporaryDirectory((directory) => {
    assert.throws(
      () => saveModelConnection(directory, fakeSafeStorage, {
        provider: 'openai',
        model: 'anthropic/wrong-provider',
        apiKey: 'sk-test',
      }),
      /must begin with openai\//
    )
    assert.throws(
      () => saveModelConnection(directory, { isEncryptionAvailable: () => false }, {
        provider: 'openai',
        model: 'openai/gpt-5',
        apiKey: 'sk-test',
      }),
      /Secure credential storage/
    )
    assert.equal(hasSecureStorage({
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text',
    }), false)
  })
})
