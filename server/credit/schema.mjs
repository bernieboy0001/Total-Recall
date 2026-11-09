// The wire format stored in Walrus Memory. One memory = one natural-language
// sentence with compact, parseable tags. Keeping the tags inside the text means
// the policy is rebuilt from the blobs alone — no database, no side index.
//
// [CREDIT] 2026-11-09T10:15:00Z | from:alice to:bob | type:repayment | amount:5.00 | result:success | note:paid on time

export const PARTIES = ['alice', 'bob', 'agent']
export const TYPES = ['repayment', 'default', 'advance', 'fulfillment', 'request']
export const RESULTS = ['success', 'failed', 'pending']

const CREDIT_PREFIX = '[CREDIT]'
const MAX_NOTE = 180

export function isParty(value) {
  return PARTIES.includes(value)
}

export function isType(value) {
  return TYPES.includes(value)
}

export function isResult(value) {
  return RESULTS.includes(value)
}

export function isoNow(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function cleanNote(note) {
  return String(note ?? '')
    .replace(/\|/g, '/')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOTE)
}

/**
 * Serialize an interaction into the exact sentence written to Walrus Memory.
 * The memory text is the source of truth: blob_id is appended by recall, never
 * stored in the text, so the same sentence can be verified against its blob.
 */
export function serializeInteraction(input) {
  const type = String(input.type ?? '').toLowerCase()
  const from = String(input.from ?? '').toLowerCase()
  const to = String(input.to ?? '').toLowerCase()
  const result = String(input.result ?? '').toLowerCase()
  const amount = Number(input.amount)
  const timestamp = input.timestamp ? new Date(input.timestamp).toISOString().replace(/\.\d{3}Z$/, 'Z') : isoNow()

  if (!isType(type)) throw new Error(`Invalid interaction type: ${input.type}`)
  if (!isParty(from) || !isParty(to)) throw new Error('Invalid interaction party')
  if (from === to) throw new Error('from and to must be different parties')
  if (!isResult(result)) throw new Error(`Invalid result: ${input.result}`)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('amount must be a non-negative number')

  const note = cleanNote(input.note)
  return [
    `${CREDIT_PREFIX} ${timestamp}`,
    `from:${from} to:${to}`,
    `type:${type}`,
    `amount:${amount.toFixed(2)}`,
    `result:${result}`,
    note ? `note:${note}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
}

function readFields(rest) {
  const fields = {}
  for (const chunk of rest.split('|')) {
    const part = chunk.trim()
    if (!part) continue

    const keyMatches = [...part.matchAll(/(^|\s)([a-z_]+)\s*:\s*/gi)]
    if (keyMatches.length > 1) {
      // `from:alice to:bob` packs two pairs into one pipe segment.
      for (const pair of part.matchAll(/([a-z_]+)\s*:\s*([^\s]+)/gi)) {
        fields[pair[1].toLowerCase()] = pair[2].trim()
      }
      continue
    }

    const match = part.match(/^([a-z_]+)\s*:\s*(.*)$/i)
    if (match) {
      fields[match[1].toLowerCase()] = match[2].trim()
    }
  }
  return fields
}

/**
 * Parse a recalled memory. Returns null for anything that isn't a valid CREDIT
 * record, so unrelated memories in the shared namespace are ignored rather than
 * poisoning the policy.
 */
export function parseInteraction(text, blobId) {
  if (typeof text !== 'string') return null
  const line = text.trim()
  if (!line.startsWith(CREDIT_PREFIX)) return null

  const withoutPrefix = line.slice(CREDIT_PREFIX.length).trim()
  const firstPipe = withoutPrefix.indexOf('|')
  const stamp = (firstPipe === -1 ? withoutPrefix : withoutPrefix.slice(0, firstPipe)).trim()
  const rest = firstPipe === -1 ? '' : withoutPrefix.slice(firstPipe + 1)
  const fields = readFields(rest)

  const type = String(fields.type ?? '').toLowerCase()
  const from = String(fields.from ?? '').toLowerCase()
  const to = String(fields.to ?? '').toLowerCase()
  const result = String(fields.result ?? '').toLowerCase()
  const amount = Number(fields.amount)

  if (!isType(type) || !isParty(from) || !isParty(to)) return null
  if (from === to || !isResult(result) || !Number.isFinite(amount) || amount < 0) return null

  const parsedStamp = new Date(stamp)
  const timestamp = Number.isNaN(parsedStamp.getTime()) ? null : parsedStamp.toISOString()
  if (!timestamp) return null

  return {
    id: blobId ?? `${timestamp}-${from}-${to}-${type}-${amount}`,
    blobId: blobId ?? null,
    text: line,
    type,
    from,
    to,
    amount,
    result,
    timestamp,
    note: fields.note ?? '',
  }
}

export function pairKey(interaction) {
  return [interaction.from, interaction.to].sort().join(':')
}

export function isWithinDays(timestamp, days, now = Date.now()) {
  const then = new Date(timestamp).getTime()
  if (Number.isNaN(then)) return false
  const age = now - then
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000
}

export function compareInteractions(a, b) {
  const byTime = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  if (byTime !== 0) return byTime
  return String(a.blobId ?? a.id).localeCompare(String(b.blobId ?? b.id))
}

export function round1(value) {
  return Math.round(value * 10) / 10
}
