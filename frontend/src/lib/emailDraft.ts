export type EmailDraft = {
  to: string[]
  cc: string[]
  subject: string
  body: string
}

export type EmailDraftValidation = {
  valid: boolean
  errors: string[]
  draft: EmailDraft
}

export const EMAIL_DRAFT_LIMITS = {
  recipients: 20,
  subject: 200,
  body: 12_000,
  mailto: 24_000,
} as const

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

function metadataValue(line: string, label: string): string | null {
  const expression = new RegExp(
    `^\\s*(?:[-*]\\s*)?\\*\\*${label}:\\*\\*\\s*(.*?)\\s*$`,
    'i'
  )
  return line.match(expression)?.[1]?.trim() ?? null
}

export function parseRecipientText(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(/[,;\n]/)
    .map((recipient) => recipient.trim().toLowerCase())
    .filter((recipient) => {
      if (!recipient || seen.has(recipient)) return false
      seen.add(recipient)
      return true
    })
}

export function parseEmailDraft(content: string, filename = 'message.md'): EmailDraft {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let subject = ''
  let to: string[] = []
  let cc: string[] = []

  for (const line of lines) {
    const subjectValue = metadataValue(line, 'Subject')
    if (subjectValue !== null && !subject) subject = subjectValue
    const toValue = metadataValue(line, 'To')
    if (toValue !== null && to.length === 0) {
      const candidates = parseRecipientText(toValue)
      if (candidates.every((recipient) => EMAIL_PATTERN.test(recipient))) to = candidates
    }
    const ccValue = metadataValue(line, 'CC')
    if (ccValue !== null && cc.length === 0) {
      const candidates = parseRecipientText(ccValue)
      if (candidates.every((recipient) => EMAIL_PATTERN.test(recipient))) cc = candidates
    }
  }

  const bodyLines = lines.filter((line, index) => {
    if (index === 0 && /^#\s+draft\b.*message\s*$/i.test(line.trim())) return false
    if (/^>\s*\*\*draft\b/i.test(line.trim())) return false
    if (metadataValue(line, 'To') !== null) return false
    if (metadataValue(line, 'CC') !== null) return false
    if (metadataValue(line, 'Subject') !== null) return false
    return true
  })
  let body = bodyLines.join('\n').trim()
  body = body.replace(/\n*---\s*\n+Draft only\b[\s\S]*$/i, '').trim()

  const fallbackSubject = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())

  return { to, cc, subject: subject || fallbackSubject, body }
}

export function validateEmailDraft(input: EmailDraft): EmailDraftValidation {
  const draft = {
    to: input.to.map((recipient) => recipient.trim().toLowerCase()).filter(Boolean),
    cc: input.cc.map((recipient) => recipient.trim().toLowerCase()).filter(Boolean),
    subject: input.subject.trim(),
    body: input.body.trim(),
  }
  const recipients = [...draft.to, ...draft.cc]
  const errors: string[] = []
  if (draft.to.length === 0) errors.push('Add at least one To recipient.')
  if (recipients.length > EMAIL_DRAFT_LIMITS.recipients) {
    errors.push(`Use no more than ${EMAIL_DRAFT_LIMITS.recipients} total recipients.`)
  }
  if (recipients.some((recipient) => !EMAIL_PATTERN.test(recipient))) {
    errors.push('Check that every recipient is a complete email address.')
  }
  if (!draft.subject) errors.push('Add a subject.')
  if (draft.subject.length > EMAIL_DRAFT_LIMITS.subject) {
    errors.push(`Keep the subject under ${EMAIL_DRAFT_LIMITS.subject} characters.`)
  }
  if (!draft.body) errors.push('Add message content.')
  if (draft.body.length > EMAIL_DRAFT_LIMITS.body) {
    errors.push(`Keep the message under ${EMAIL_DRAFT_LIMITS.body.toLocaleString()} characters.`)
  }
  return { valid: errors.length === 0, errors, draft }
}

export function buildMailtoUrl(input: EmailDraft): string {
  const result = validateEmailDraft(input)
  if (!result.valid) throw new Error(result.errors[0])
  const { draft } = result
  const query = new URLSearchParams({ subject: draft.subject, body: draft.body })
  if (draft.cc.length) query.set('cc', draft.cc.join(','))
  const url = `mailto:${encodeURIComponent(draft.to.join(','))}?${query.toString()}`
  if (url.length > EMAIL_DRAFT_LIMITS.mailto) {
    throw new Error('This draft is too large to open safely. Shorten the message and try again.')
  }
  return url
}

export function canonicalEmailDraft(input: EmailDraft): string {
  const { draft } = validateEmailDraft(input)
  return JSON.stringify({
    to: draft.to,
    cc: draft.cc,
    subject: draft.subject,
    body: draft.body,
  })
}
