const fs = require('node:fs')
const path = require('node:path')

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'openai/gpt-5',
    environmentVariable: 'OPENAI_API_KEY',
  },
  anthropic: {
    label: 'Anthropic',
    defaultModel: 'anthropic/claude-sonnet-4-5',
    environmentVariable: 'ANTHROPIC_API_KEY',
  },
}

function settingsPath(dataDirectory) {
  return path.join(dataDirectory, 'model-connection.json')
}

function includedConnection() {
  return {
    provider: 'included',
    providerLabel: 'WorkerBee included',
    model: null,
    apiKey: null,
    keyLast4: null,
    configured: false,
  }
}

function hasSecureStorage(safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) return false
  const backend = typeof safeStorage.getSelectedStorageBackend === 'function'
    ? safeStorage.getSelectedStorageBackend()
    : null
  return backend !== 'basic_text'
}

function readModelConnection(dataDirectory, safeStorage) {
  const fallback = includedConnection()
  try {
    const stored = JSON.parse(fs.readFileSync(settingsPath(dataDirectory), 'utf8'))
    const provider = PROVIDERS[stored.provider]
    if (!provider || typeof stored.model !== 'string' || !stored.model.startsWith(`${stored.provider}/`)) {
      return fallback
    }
    if (!hasSecureStorage(safeStorage) || typeof stored.encryptedApiKey !== 'string') {
      return fallback
    }
    const apiKey = safeStorage.decryptString(Buffer.from(stored.encryptedApiKey, 'base64'))
    if (!apiKey) return fallback
    return {
      provider: stored.provider,
      providerLabel: provider.label,
      model: stored.model,
      apiKey,
      keyLast4: apiKey.slice(-4),
      configured: true,
    }
  } catch {
    return fallback
  }
}

function publicModelConnection(connection, safeStorage) {
  return {
    provider: connection.provider,
    providerLabel: connection.providerLabel,
    model: connection.model,
    keyLast4: connection.keyLast4,
    configured: connection.configured,
    secureStorageAvailable: hasSecureStorage(safeStorage),
  }
}

function saveModelConnection(dataDirectory, safeStorage, input) {
  const providerId = typeof input?.provider === 'string' ? input.provider : ''
  if (providerId === 'included') {
    try {
      fs.unlinkSync(settingsPath(dataDirectory))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    return includedConnection()
  }

  const provider = PROVIDERS[providerId]
  if (!provider) throw new Error('Choose a supported model service.')
  if (!hasSecureStorage(safeStorage)) {
    throw new Error('Secure credential storage is not available on this computer.')
  }

  const existing = readModelConnection(dataDirectory, safeStorage)
  const suppliedApiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
  const apiKey = suppliedApiKey || (existing.provider === providerId ? existing.apiKey : '')
  if (!apiKey) throw new Error(`Enter an API key for ${provider.label}.`)

  const model = (typeof input?.model === 'string' ? input.model.trim() : '') || provider.defaultModel
  if (!model.startsWith(`${providerId}/`) || model.includes(' ')) {
    throw new Error(`The model ID must begin with ${providerId}/ and contain no spaces.`)
  }

  fs.mkdirSync(dataDirectory, { recursive: true })
  const destination = settingsPath(dataDirectory)
  const encryptedApiKey = safeStorage.encryptString(apiKey).toString('base64')
  fs.writeFileSync(
    destination,
    JSON.stringify({ provider: providerId, model, encryptedApiKey }, null, 2),
    { encoding: 'utf8', mode: 0o600 }
  )
  return {
    provider: providerId,
    providerLabel: provider.label,
    model,
    apiKey,
    keyLast4: apiKey.slice(-4),
    configured: true,
  }
}

function buildAgentModelConfiguration(connection) {
  const config = {
    $schema: 'https://opencode.ai/config.json',
    permission: { '*': 'allow' },
    snapshot: false,
    autoupdate: false,
    share: 'disabled',
  }
  if (!connection.configured || !PROVIDERS[connection.provider]) return config
  return {
    ...config,
    model: connection.model,
    enabled_providers: [connection.provider],
  }
}

function buildAgentEnvironment(connection) {
  const provider = PROVIDERS[connection.provider]
  if (!connection.configured || !provider || !connection.apiKey) return {}
  return { [provider.environmentVariable]: connection.apiKey }
}

module.exports = {
  PROVIDERS,
  buildAgentEnvironment,
  buildAgentModelConfiguration,
  hasSecureStorage,
  includedConnection,
  publicModelConnection,
  readModelConnection,
  saveModelConnection,
}
