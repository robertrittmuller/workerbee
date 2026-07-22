import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/lib/calendarDraft.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  Array,
  Date,
  Intl,
  JSON,
  Math,
  Number,
  RegExp,
  Set,
  TextEncoder,
})

const {
  buildCalendarIcs,
  canonicalCalendarDraft,
  parseMeetingCalendarDraft,
  validateCalendarDraft,
} = module.exports

function draft(overrides = {}) {
  return {
    uid: 'workerbee-artifact-123@local',
    title: 'Follow-up: Renewal review',
    startLocal: '2026-07-27T10:30',
    durationMinutes: 45,
    timezone: 'America/New_York',
    location: 'Room 2; video',
    attendees: ['owner@example.com'],
    notes: 'Review actions, risks, and next steps.',
    ...overrides,
  }
}

test('prepares an editable tentative event from the exact meeting follow-up', () => {
  const parsed = parseMeetingCalendarDraft(
    '# Acme renewal review — Follow-up\n\n## Executive summary\n\nRenewal is at risk.\n\n> Review this follow-up against the source notes before sharing.',
    'artifact-123'
  )
  assert.equal(parsed.uid, 'workerbee-artifact-123@local')
  assert.equal(parsed.title, 'Follow-up: Acme renewal review')
  assert.equal(parsed.startLocal, '')
  assert.equal(parsed.durationMinutes, 30)
  assert.match(parsed.notes, /^## Executive summary/)
  assert.doesNotMatch(parsed.notes, /Review this follow-up/)
})

test('validates exact local scheduling and optional attendees', () => {
  assert.equal(validateCalendarDraft(draft({ attendees: [] })).valid, true)
  assert.equal(validateCalendarDraft(draft({ startLocal: '2026-02-30T10:30' })).valid, false)
  assert.equal(validateCalendarDraft(draft({ attendees: ['javascript:alert(1)'] })).valid, false)
  assert.equal(validateCalendarDraft(draft({ durationMinutes: 10 })).valid, false)
  assert.throws(() => canonicalCalendarDraft(draft({ startLocal: '2026-02-30T10:30' })))
})

test('renders a folded RFC 5545 calendar draft without changing reviewed fields', () => {
  const input = draft({
    title: 'Renewal review, decisions & next steps',
    notes: 'Line one\nLine two; with a comma, and a long detail '.repeat(5),
  })
  const ics = buildCalendarIcs(input, new Date('2026-07-22T12:00:00Z'))
  assert.match(ics, /DTSTART;TZID=America\/New_York:20260727T103000/)
  assert.match(ics, /DURATION:PT45M/)
  assert.match(ics, /SUMMARY:Renewal review\\, decisions & next steps/)
  assert.match(ics, /STATUS:TENTATIVE/)
  assert.ok(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75))
  assert.match(canonicalCalendarDraft(input), /"startLocal":"2026-07-27T10:30"/)
})
