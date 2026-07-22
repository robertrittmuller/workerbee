export type CalendarDraft = {
  uid: string
  title: string
  startLocal: string
  durationMinutes: number
  timezone: string
  location: string
  attendees: string[]
  notes: string
}

export type CalendarDraftValidation = {
  valid: boolean
  errors: string[]
  draft: CalendarDraft
}

export const CALENDAR_DRAFT_LIMITS = {
  attendees: 20,
  title: 200,
  location: 500,
  notes: 12_000,
  durationMinimum: 15,
  durationMaximum: 480,
} as const

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const LOCAL_START_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/

export function parseCalendarAttendees(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(/[,;\n]/)
    .map((attendee) => attendee.trim().toLowerCase())
    .filter((attendee) => {
      if (!attendee || seen.has(attendee)) return false
      seen.add(attendee)
      return true
    })
}

function validLocalStart(value: string): boolean {
  const match = value.match(LOCAL_START_PATTERN)
  if (!match) return false
  const [, year, month, day, hour, minute] = match.map(Number)
  const candidate = new Date(year, month - 1, day, hour, minute)
  return candidate.getFullYear() === year
    && candidate.getMonth() === month - 1
    && candidate.getDate() === day
    && candidate.getHours() === hour
    && candidate.getMinutes() === minute
}

export function validateCalendarDraft(input: CalendarDraft): CalendarDraftValidation {
  const draft = {
    uid: input.uid.trim(),
    title: input.title.trim(),
    startLocal: input.startLocal.trim(),
    durationMinutes: Number(input.durationMinutes),
    timezone: input.timezone.trim(),
    location: input.location.trim(),
    attendees: input.attendees.map((attendee) => attendee.trim().toLowerCase()).filter(Boolean),
    notes: input.notes.trim(),
  }
  const errors: string[] = []
  if (!draft.uid || draft.uid.length > 240 || /[\r\n]/.test(draft.uid)) {
    errors.push('WorkerBee could not identify this calendar draft safely.')
  }
  if (!draft.title) errors.push('Add an event title.')
  if (draft.title.length > CALENDAR_DRAFT_LIMITS.title) {
    errors.push(`Keep the title under ${CALENDAR_DRAFT_LIMITS.title} characters.`)
  }
  if (!validLocalStart(draft.startLocal)) errors.push('Choose a valid start date and time.')
  if (!TIMEZONE_PATTERN.test(draft.timezone)) errors.push('Choose a recognized calendar timezone.')
  if (!Number.isInteger(draft.durationMinutes)
    || draft.durationMinutes < CALENDAR_DRAFT_LIMITS.durationMinimum
    || draft.durationMinutes > CALENDAR_DRAFT_LIMITS.durationMaximum) {
    errors.push(`Choose a duration from ${CALENDAR_DRAFT_LIMITS.durationMinimum} minutes to 8 hours.`)
  }
  if (draft.attendees.length > CALENDAR_DRAFT_LIMITS.attendees) {
    errors.push(`Use no more than ${CALENDAR_DRAFT_LIMITS.attendees} attendees.`)
  }
  if (draft.attendees.some((attendee) => !EMAIL_PATTERN.test(attendee))) {
    errors.push('Check that every attendee is a complete email address.')
  }
  if (draft.location.length > CALENDAR_DRAFT_LIMITS.location) {
    errors.push(`Keep the location under ${CALENDAR_DRAFT_LIMITS.location} characters.`)
  }
  if (draft.notes.length > CALENDAR_DRAFT_LIMITS.notes) {
    errors.push(`Keep the notes under ${CALENDAR_DRAFT_LIMITS.notes.toLocaleString()} characters.`)
  }
  return { valid: errors.length === 0, errors, draft }
}

function calendarTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return timezone && TIMEZONE_PATTERN.test(timezone) ? timezone : 'UTC'
}

function boundedNotes(content: string): string {
  const normalized = content
    .replace(/\r\n?/g, '\n')
    .replace(/^#\s+.*\n+/, '')
    .replace(/\n*>\s*Review this follow-up[\s\S]*$/i, '')
    .trim()
  if (normalized.length <= CALENDAR_DRAFT_LIMITS.notes) return normalized
  const suffix = '\n\n[Notes shortened for the calendar draft. The complete follow-up remains in WorkerBee.]'
  return `${normalized.slice(0, CALENDAR_DRAFT_LIMITS.notes - suffix.length).trimEnd()}${suffix}`
}

export function parseMeetingCalendarDraft(content: string, artifactId: string): CalendarDraft {
  const heading = content.replace(/\r\n?/g, '\n').match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Meeting follow-up'
  const meetingName = heading.replace(/\s+[—-]\s+Follow-up\s*$/i, '').trim()
  const safeId = artifactId.trim().replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 180) || 'meeting-follow-up'
  return {
    uid: `workerbee-${safeId}@local`,
    title: meetingName ? `Follow-up: ${meetingName}` : 'Meeting follow-up',
    startLocal: '',
    durationMinutes: 30,
    timezone: calendarTimezone(),
    location: '',
    attendees: [],
    notes: boundedNotes(content),
  }
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function foldIcsLine(line: string): string[] {
  const lines: string[] = []
  let current = ''
  for (const character of Array.from(line)) {
    if (new TextEncoder().encode(`${current}${character}`).length > 75) {
      lines.push(current)
      current = ` ${character}`
    } else {
      current += character
    }
  }
  lines.push(current)
  return lines
}

function utcStamp(value: Date): string {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function buildCalendarIcs(input: CalendarDraft, generatedAt = new Date()): string {
  const result = validateCalendarDraft(input)
  if (!result.valid) throw new Error(result.errors[0])
  const { draft } = result
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

export function canonicalCalendarDraft(input: CalendarDraft): string {
  const result = validateCalendarDraft(input)
  if (!result.valid) throw new Error(result.errors[0])
  const { draft } = result
  return JSON.stringify({
    uid: draft.uid,
    title: draft.title,
    startLocal: draft.startLocal,
    durationMinutes: draft.durationMinutes,
    timezone: draft.timezone,
    location: draft.location,
    attendees: draft.attendees,
    notes: draft.notes,
  })
}

export function calendarDraftFilename(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'workerbee-calendar-draft'
  return `${base}.ics`
}
