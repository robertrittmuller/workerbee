const fs = require('node:fs')
const path = require('node:path')

const PLATFORM_ALIASES = new Map([
  ['darwin', 'darwin'],
  ['mac', 'darwin'],
  ['macos', 'darwin'],
  ['win', 'win32'],
  ['win32', 'win32'],
  ['windows', 'win32'],
  ['linux', 'linux'],
])

const BUILDER_ARCHES = new Map([
  [0, 'ia32'],
  [1, 'x64'],
  [2, 'armv7l'],
  [3, 'arm64'],
  [4, 'universal'],
])

function normalizePlatform(value) {
  const normalized = PLATFORM_ALIASES.get(String(value || '').toLowerCase())
  if (!normalized) {
    throw new Error(`Unsupported desktop platform: ${value || '(missing)'}`)
  }
  return normalized
}

function normalizeArch(value) {
  if (BUILDER_ARCHES.has(value)) return BUILDER_ARCHES.get(value)
  const normalized = String(value || '').toLowerCase()
  if (['x64', 'arm64', 'ia32', 'armv7l', 'universal'].includes(normalized)) {
    return normalized
  }
  throw new Error(`Unsupported desktop architecture: ${value || '(missing)'}`)
}

function machArch(buffer, littleEndian) {
  const cpuType = littleEndian ? buffer.readUInt32LE(4) : buffer.readUInt32BE(4)
  if (cpuType === 0x01000007) return 'x64'
  if (cpuType === 0x0100000c) return 'arm64'
  return 'unknown'
}

function inspectBinaryBuffer(buffer) {
  if (buffer.length < 20) return { platform: 'unknown', arch: 'unknown' }

  const signature = buffer.subarray(0, 4).toString('hex')
  if (signature === 'cffaedfe') {
    return { platform: 'darwin', arch: machArch(buffer, true) }
  }
  if (signature === 'feedfacf') {
    return { platform: 'darwin', arch: machArch(buffer, false) }
  }
  if (signature === 'cafebabe' || signature === 'bebafeca') {
    return { platform: 'darwin', arch: 'universal' }
  }

  if (buffer[0] === 0x4d && buffer[1] === 0x5a && buffer.length >= 64) {
    const peOffset = buffer.readUInt32LE(0x3c)
    if (peOffset + 6 <= buffer.length && buffer.toString('ascii', peOffset, peOffset + 4) === 'PE\0\0') {
      const machine = buffer.readUInt16LE(peOffset + 4)
      const arch = machine === 0x8664 ? 'x64' : machine === 0xaa64 ? 'arm64' : 'unknown'
      return { platform: 'win32', arch }
    }
  }

  if (signature === '7f454c46') {
    const littleEndian = buffer[5] === 1
    const machine = littleEndian ? buffer.readUInt16LE(18) : buffer.readUInt16BE(18)
    const arch = machine === 0x3e ? 'x64' : machine === 0xb7 ? 'arm64' : 'unknown'
    return { platform: 'linux', arch }
  }

  return { platform: 'unknown', arch: 'unknown' }
}

function inspectBinary(filePath) {
  const descriptor = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(4096)
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0)
    return inspectBinaryBuffer(buffer.subarray(0, bytesRead))
  } finally {
    fs.closeSync(descriptor)
  }
}

function runtimeNames(platform) {
  const normalized = normalizePlatform(platform)
  return normalized === 'win32'
    ? ['workerbee-backend.exe', 'opencode.exe']
    : ['workerbee-backend', 'opencode']
}

function assertRuntimeBundle(runtimeDirectory, platform, arch) {
  const expectedPlatform = normalizePlatform(platform)
  const expectedArch = normalizeArch(arch)
  const inspected = []

  for (const executableName of runtimeNames(expectedPlatform)) {
    const executablePath = path.join(runtimeDirectory, executableName)
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Missing ${expectedPlatform} runtime executable: ${executablePath}`)
    }

    const actual = inspectBinary(executablePath)
    if (actual.platform !== expectedPlatform) {
      throw new Error(
        `${executableName} is ${actual.platform}/${actual.arch}, not ${expectedPlatform}/${expectedArch}. ` +
        'Build desktop installers on their native operating system.'
      )
    }
    if (actual.arch !== expectedArch) {
      throw new Error(
        `${executableName} is ${actual.platform}/${actual.arch}, not ${expectedPlatform}/${expectedArch}.`
      )
    }
    if (expectedPlatform !== 'win32' && (fs.statSync(executablePath).mode & 0o111) === 0) {
      throw new Error(`${executableName} is not executable.`)
    }
    inspected.push({ executableName, ...actual })
  }

  return inspected
}

module.exports = {
  assertRuntimeBundle,
  inspectBinary,
  inspectBinaryBuffer,
  normalizeArch,
  normalizePlatform,
  runtimeNames,
}
