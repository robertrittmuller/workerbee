const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const MAX_RECIPIENTS = 20
const MAX_SUBJECT = 200
const MAX_BODY = 12_000
const MAX_MAILTO = 24_000

function normalizeRecipients(value) {
  if (!Array.isArray(value)) throw new Error('Email recipients must be a list.')
  return value.map((recipient) => {
    if (typeof recipient !== 'string') throw new Error('Every recipient must be an email address.')
    return recipient.trim().toLowerCase()
  }).filter(Boolean)
}

function validateEmailDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Email draft details are required.')
  }
  const to = normalizeRecipients(input.to)
  const cc = normalizeRecipients(input.cc || [])
  const recipients = [...to, ...cc]
  if (to.length === 0) throw new Error('Add at least one To recipient.')
  if (recipients.length > MAX_RECIPIENTS) throw new Error(`Use no more than ${MAX_RECIPIENTS} total recipients.`)
  if (recipients.some((recipient) => !EMAIL_PATTERN.test(recipient))) {
    throw new Error('Check that every recipient is a complete email address.')
  }
  if (typeof input.subject !== 'string' || !input.subject.trim()) throw new Error('Add a subject.')
  if (input.subject.trim().length > MAX_SUBJECT) throw new Error('The email subject is too long.')
  if (typeof input.body !== 'string' || !input.body.trim()) throw new Error('Add message content.')
  if (input.body.trim().length > MAX_BODY) throw new Error('The email message is too long.')
  return { to, cc, subject: input.subject.trim(), body: input.body.trim() }
}

function buildMailtoUrl(input) {
  const draft = validateEmailDraft(input)
  const query = new URLSearchParams({ subject: draft.subject, body: draft.body })
  if (draft.cc.length) query.set('cc', draft.cc.join(','))
  const url = `mailto:${encodeURIComponent(draft.to.join(','))}?${query.toString()}`
  if (url.length > MAX_MAILTO) throw new Error('This draft is too large to open safely.')
  return url
}

module.exports = { buildMailtoUrl, validateEmailDraft }
