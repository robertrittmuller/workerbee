const assert = require('node:assert/strict')
const test = require('node:test')

const { buildMailtoUrl, validateEmailDraft } = require('../src/email-draft.cjs')

test('builds a mailto URL from a validated draft', () => {
  const url = buildMailtoUrl({
    to: ['Leader@Example.com'],
    cc: ['pm@example.com'],
    subject: 'Weekly status & decisions',
    body: 'Hello,\n\nHere is the update.',
  })
  assert.match(url, /^mailto:/)
  assert.match(url, /subject=Weekly\+status\+%26\+decisions/)
  assert.match(url, /cc=pm%40example.com/)
  assert.ok(!url.startsWith('https:'))
})

test('rejects missing or malformed recipients', () => {
  assert.throws(
    () => validateEmailDraft({ to: [], cc: [], subject: 'Update', body: 'Body' }),
    /at least one To recipient/
  )
  assert.throws(
    () => validateEmailDraft({ to: ['javascript:alert(1)'], cc: [], subject: 'Update', body: 'Body' }),
    /complete email address/
  )
})

test('rejects oversized content before opening an external app', () => {
  assert.throws(
    () => buildMailtoUrl({ to: ['lead@example.com'], cc: [], subject: 'Update', body: 'x'.repeat(12_001) }),
    /too long/
  )
})
