const path = require('node:path')

const MAX_EXPORT_BYTES = 250 * 1024 * 1024
const MAX_FILENAME_LENGTH = 180

function safeExportFilename(value) {
  if (typeof value !== 'string') throw new Error('A filename is required to save this file.')
  const basename = path.basename(value.replace(/\\/g, '/'))
  const cleaned = basename
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/^\.+/, '')
    .trim()
  if (!cleaned) throw new Error('Choose a valid filename for this file.')
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned
  const extension = path.extname(cleaned).slice(0, 20)
  const stemLimit = Math.max(1, MAX_FILENAME_LENGTH - extension.length)
  return `${cleaned.slice(0, stemLimit)}${extension}`
}

function exportBuffer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('File details are required.')
  }
  const filename = safeExportFilename(input.filename)
  const bytes = input.bytes
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) {
    throw new Error('File content must be binary data.')
  }
  if (!bytes.byteLength) throw new Error('WorkerBee cannot save an empty file.')
  if (bytes.byteLength > MAX_EXPORT_BYTES) {
    throw new Error('This file is too large to save through WorkerBee.')
  }
  const buffer = Buffer.from(bytes)
  return { filename, buffer }
}

module.exports = { MAX_EXPORT_BYTES, exportBuffer, safeExportFilename }
