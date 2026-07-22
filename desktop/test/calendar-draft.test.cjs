const assert = require('node:assert/strict')
const test = require('node:test')

const { buildCalendarIcs, validateCalendarDraft } = require('../src/calendar-draft.cjs')

function draft(overrides = {}) {
  return {
    uid: 'workerbee-artifact-123@local',
    title: 'Renewal follow-up',
    startLocal: '2026-07-27T10:30',
    durationMinutes: 45,
    timezone: 'America/New_York',
    location: 'Room 2; video',
    attendees: ['OWNER@EXAMPLE.COM'],
    notes: 'Review actions, risks, and next steps.',
    ...overrides,
  }
}

test('builds a tentative standards-based calendar draft with exact local time', () => {
  const ics = buildCalendarIcs(draft(), new Date('2026-07-22T12:00:00Z'))
  assert.match(ics, /BEGIN:VCALENDAR\r\n/)
  assert.match(ics, /DTSTART;TZID=America\/New_York:20260727T103000/)
  assert.match(ics, /DURATION:PT45M/)
  assert.match(ics, /ATTENDEE:mailto:owner@example.com/)
  assert.match(ics, /LOCATION:Room 2\\; video/)
  assert.match(ics, /STATUS:TENTATIVE/)
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75))
})

test('allows a calendar draft without attendees but rejects invalid schedule metadata', () => {
  assert.deepEqual(validateCalendarDraft(draft({ attendees: [] })).attendees, [])
  assert.throws(() => validateCalendarDraft(draft({ startLocal: '2026-02-30T10:30' })), /valid start/)
  assert.throws(() => validateCalendarDraft(draft({ timezone: 'Not/A_Real_Timezone' })), /recognized calendar timezone/)
  assert.throws(() => validateCalendarDraft(draft({ durationMinutes: 10 })), /15 minutes/)
})

test('rejects injected or oversized calendar fields before opening an external app', () => {
  assert.throws(() => validateCalendarDraft(draft({ uid: 'safe\r\nBEGIN:VEVENT' })), /identifier/)
  assert.throws(() => validateCalendarDraft(draft({ attendees: ['javascript:alert(1)'] })), /complete email address/)
  assert.throws(() => validateCalendarDraft(draft({ notes: 'x'.repeat(12_001) })), /too long/)
})
