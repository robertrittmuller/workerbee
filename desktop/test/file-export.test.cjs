const assert = require('node:assert/strict')
const test = require('node:test')

const { MAX_EXPORT_BYTES, exportBuffer, safeExportFilename } = require('../src/file-export.cjs')

test('keeps a normal business filename and removes path traversal', () => {
  assert.equal(safeExportFilename('quarterly-report.xlsx'), 'quarterly-report.xlsx')
  assert.equal(safeExportFilename('../../private/leadership-brief.md'), 'leadership-brief.md')
  assert.equal(safeExportFilename('..\\..\\private\\scorecard.csv'), 'scorecard.csv')
})

test('normalizes unsafe filename characters without dropping the extension', () => {
  assert.equal(safeExportFilename('Q3: plan?.pptx'), 'Q3- plan-.pptx')
  assert.equal(safeExportFilename('.hidden-output.md'), 'hidden-output.md')
})

test('accepts binary content and returns an isolated buffer', () => {
  const source = Uint8Array.from([1, 2, 3])
  const result = exportBuffer({ filename: 'data.csv', bytes: source })
  source[0] = 9
  assert.equal(result.filename, 'data.csv')
  assert.deepEqual([...result.buffer], [1, 2, 3])
})

test('rejects empty, malformed, and oversized export requests', () => {
  assert.throws(() => exportBuffer({ filename: 'empty.txt', bytes: new Uint8Array() }), /empty file/)
  assert.throws(() => exportBuffer({ filename: 'bad.txt', bytes: 'not binary' }), /binary data/)
  assert.throws(
    () => exportBuffer({ filename: 'large.bin', bytes: new Uint8Array(MAX_EXPORT_BYTES + 1) }),
    /too large/
  )
})
