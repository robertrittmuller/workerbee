const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const LOCAL_START_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)$/
const MAX_ATTENDEES = 20
const MAX_TITLE = 200
const MAX_LOCATION = 500
const MAX_NOTES = 12_000

function validLocalStart(value) {
  const match = typeof value === 'string' ? value.match(LOCAL_START_PATTERN) : null
  if (!match) return false
  const [, year, month, day, hour, minute] = match.map(Number)
  const candidate = new Date(year, month - 1, day, hour, minute)
  return candidate.getFullYear() === year
    && candidate.getMonth() === month - 1
    && candidate.getDate() === day
    && candidate.getHours() === hour
    && candidate.getMinutes() === minute
}

function validTimezone(value) {
  if (typeof value !== 'string' || !TIMEZONE_PATTERN.test(value)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function validateCalendarDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Calendar draft details are required.')
  }
  const uid = typeof input.uid === 'string' ? input.uid.trim() : ''
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const startLocal = typeof input.startLocal === 'string' ? input.startLocal.trim() : ''
  const timezone = typeof input.timezone === 'string' ? input.timezone.trim() : ''
  const durationMinutes = Number(input.durationMinutes)
  const location = typeof input.location === 'string' ? input.location.trim() : ''
  const notes = typeof input.notes === 'string' ? input.notes.trim() : ''
  if (!Array.isArray(input.attendees)) throw new Error('Calendar attendees must be a list.')
  const attendees = input.attendees.map((attendee) => {
    if (typeof attendee !== 'string') throw new Error('Every attendee must be an email address.')
    return attendee.trim().toLowerCase()
  }).filter(Boolean)
  if (!uid || uid.length > 240 || /[\r\n]/.test(uid)) throw new Error('The calendar draft identifier is invalid.')
  if (!title) throw new Error('Add an event title.')
  if (title.length > MAX_TITLE) throw new Error('The calendar event title is too long.')
  if (!validLocalStart(startLocal)) throw new Error('Choose a valid start date and time.')
  if (!validTimezone(timezone)) throw new Error('Choose a recognized calendar timezone.')
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new Error('Choose a duration from 15 minutes to 8 hours.')
  }
  if (attendees.length > MAX_ATTENDEES) throw new Error(`Use no more than ${MAX_ATTENDEES} attendees.`)
  if (attendees.some((attendee) => !EMAIL_PATTERN.test(attendee))) {
    throw new Error('Check that every attendee is a complete email address.')
  }
  if (location.length > MAX_LOCATION) throw new Error('The calendar event location is too long.')
  if (notes.length > MAX_NOTES) throw new Error('The calendar event notes are too long.')
  return { uid, title, startLocal, timezone, durationMinutes, location, attendees, notes }
}

function escapeIcs(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function foldIcsLine(line) {
  const lines = []
  let current = ''
  for (const character of Array.from(line)) {
    if (Buffer.byteLength(`${current}${character}`, 'utf8') > 75) {
      lines.push(current)
      current = ` ${character}`
    } else {
      current += character
    }
  }
  lines.push(current)
  return lines
}

function utcStamp(value) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function buildCalendarIcs(input, generatedAt = new Date()) {
  const draft = validateCalendarDraft(input)
  const start = draft.startLocal.replace(/[-:]/g, '')
  const logicalLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WorkerBee//Calendar Draft//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-TIMEZONE:${escapeIcs(draft.timezone)}`,
    'BEGIN:VEVENT',
    `UID:${escapeIcs(draft.uid)}`,
    `DTSTAMP:${utcStamp(generatedAt)}`,
    `DTSTART;TZID=${draft.timezone}:${start}00`,
    `DURATION:PT${draft.durationMinutes}M`,
    `SUMMARY:${escapeIcs(draft.title)}`,
    ...(draft.location ? [`LOCATION:${escapeIcs(draft.location)}`] : []),
    ...(draft.notes ? [`DESCRIPTION:${escapeIcs(draft.notes)}`] : []),
    ...draft.attendees.map((attendee) => `ATTENDEE:mailto:${attendee}`),
    'STATUS:TENTATIVE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${logicalLines.flatMap(foldIcsLine).join('\r\n')}\r\n`
}

module.exports = { buildCalendarIcs, validateCalendarDraft }
