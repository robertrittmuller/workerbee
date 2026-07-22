const test = require('node:test')
const assert = require('node:assert/strict')
const { inspectBinaryBuffer, normalizeArch, normalizePlatform } = require('../scripts/runtime-contract.cjs')

test('normalizes packager platform and architecture values', () => {
  assert.equal(normalizePlatform('mac'), 'darwin')
  assert.equal(normalizePlatform('windows'), 'win32')
  assert.equal(normalizeArch(1), 'x64')
  assert.equal(normalizeArch(3), 'arm64')
})

test('identifies Mach-O ARM64 sidecars', () => {
  const binary = Buffer.alloc(32)
  binary.set(Buffer.from('cffaedfe', 'hex'))
  binary.writeUInt32LE(0x0100000c, 4)
  assert.deepEqual(inspectBinaryBuffer(binary), { platform: 'darwin', arch: 'arm64' })
})

test('identifies Windows x64 sidecars', () => {
  const binary = Buffer.alloc(256)
  binary.write('MZ', 0, 'ascii')
  binary.writeUInt32LE(128, 0x3c)
  binary.write('PE\0\0', 128, 'ascii')
  binary.writeUInt16LE(0x8664, 132)
  assert.deepEqual(inspectBinaryBuffer(binary), { platform: 'win32', arch: 'x64' })
})

test('identifies Linux x64 sidecars', () => {
  const binary = Buffer.alloc(32)
  binary.set(Buffer.from('7f454c46', 'hex'))
  binary[5] = 1
  binary.writeUInt16LE(0x3e, 18)
  assert.deepEqual(inspectBinaryBuffer(binary), { platform: 'linux', arch: 'x64' })
})
