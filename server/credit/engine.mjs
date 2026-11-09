import { compareInteractions, isWithinDays, round1 } from './schema.mjs'

export const BASE_LIMIT = 10
export const DEFAULT_DIRECTION = 'alice_to_bob'

export const DIRECTIONS = {
  alice_to_bob: { lender: 'alice', borrower: 'bob', label: 'Alice → Bob' },
  bob_to_alice: { lender: 'bob', borrower: 'alice', label: 'Bob → Alice' },
}

export function normalizeDirection(value) {
  if (value === 'alice_to_bob' || value === 'alice->bob') return 'alice_to_bob'
  if (value === 'bob_to_alice' || value === 'bob->alice') return 'bob_to_alice'
  throw new Error('direction must be alice_to_bob or bob_to_alice')
}

export function directionParties(direction) {
  const key = normalizeDirection(direction)
  return { key, ...DIRECTIONS[key] }
}

/**
 * Directional version of the published rule set.
 *
 * The headline formula is intentionally simple:
 *   base 10
 *   + min(amount * 0.5, 8)  for each successful repayment by the borrower
 *   - 15                    for each default / failed repayment by the borrower
 *   - amount * 0.2          for each successful advance to the borrower (drawdown)
 *   + 2                     for each borrower success in the last 7 days
 *   never below 0
 *
 * A limit is the lender's exposure to a specific borrower, so only the
 * borrower's own behaviour moves it. The equivalent read of the original
 * two-party filter: both directions are relevant, but the + / - facts are
 * attributed to the party who received or owes the credit.
 */
export function computeLimit(interactions, lender, borrower, options = {}) {
  const memoryEnabled = options.memoryEnabled !== false
  const now = options.now ?? Date.now()

  if (!memoryEnabled) {
    return {
      limit: BASE_LIMIT,
      rawLimit: BASE_LIMIT,
      breakdown: [],
      relevant: [],
      recentSuccesses: 0,
      recentBonus: 0,
      memoryEnabled: false,
    }
  }

  const relevant = interactions
    .filter(i => {
      const involved = (i.from === lender && i.to === borrower) || (i.from === borrower && i.to === lender)
      return involved && (i.from === borrower || i.to === borrower)
    })
    .slice()
    .sort(compareInteractions)

  let rawLimit = BASE_LIMIT
  const breakdown = []

  for (const interaction of relevant) {
    let delta = 0
    let rule = null

    if (
      interaction.type === 'repayment' &&
      interaction.result === 'success' &&
      interaction.from === borrower
    ) {
      delta = Math.min(interaction.amount * 0.5, 8)
      rule = 'Successful repayment'
    } else if (
      (interaction.type === 'default' || interaction.result === 'failed') &&
      interaction.from === borrower
    ) {
      delta = -15
      rule = 'Default or failed repayment'
    } else if (
      interaction.type === 'advance' &&
      interaction.result === 'success' &&
      interaction.to === borrower
    ) {
      delta = -interaction.amount * 0.2
      rule = 'Open advance drawdown'
    }

    if (!rule || delta === 0) continue
    rawLimit += delta
    breakdown.push({
      interactionId: interaction.id,
      blobId: interaction.blobId,
      rule,
      delta: round1(delta),
      amount: interaction.amount,
      type: interaction.type,
      result: interaction.result,
      timestamp: interaction.timestamp,
      from: interaction.from,
      to: interaction.to,
      note: interaction.note,
    })
  }

  const recentSuccesses = relevant.filter(
    i =>
      (i.type === 'repayment' || i.type === 'fulfillment') &&
      i.result === 'success' &&
      i.from === borrower &&
      isWithinDays(i.timestamp, 7, now),
  ).length
  const recentBonus = recentSuccesses * 2
  if (recentBonus !== 0) rawLimit += recentBonus

  const limit = round1(Math.max(0, rawLimit))

  return {
    limit,
    rawLimit: round1(rawLimit),
    breakdown,
    relevant,
    recentSuccesses,
    recentBonus,
    memoryEnabled: true,
    formula: {
      base: BASE_LIMIT,
      repayment: 'min(amount × 0.5, 8)',
      default: '−15',
      advance: '−amount × 0.2',
      recency: '+2 per borrower success in the last 7 days',
      floor: 0,
    },
  }
}

export function computeState(interactions, options = {}) {
  const memoryEnabled = options.memoryEnabled !== false
  const now = options.now ?? Date.now()
  const sorted = interactions.slice().sort(compareInteractions)

  const aliceToBob = computeLimit(sorted, 'alice', 'bob', { memoryEnabled, now })
  const bobToAlice = computeLimit(sorted, 'bob', 'alice', { memoryEnabled, now })

  return {
    aliceToBobLimit: aliceToBob.limit,
    bobToAliceLimit: bobToAlice.limit,
    memoryEnabled,
    lastUpdated: new Date(now).toISOString(),
    evidence: sorted,
    directions: {
      alice_to_bob: aliceToBob,
      bob_to_alice: bobToAlice,
    },
  }
}

export function verdictFor(amount, limit) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { verdict: 'BLOCK', approvedAmount: 0, reason: 'Invalid request amount' }
  }
  if (amount <= limit) {
    return { verdict: 'ALLOW', approvedAmount: amount, reason: 'Requested amount is inside the reconstructed limit' }
  }
  if (limit > 0 && amount <= limit * 1.5) {
    return { verdict: 'REDUCE', approvedAmount: limit, reason: 'Requested amount exceeds the limit; the policy can approve the limit itself' }
  }
  return { verdict: 'BLOCK', approvedAmount: 0, reason: 'Requested amount is above the policy ceiling' }
}

export function evaluateRequest(interactions, input) {
  const { key, lender, borrower, label } = directionParties(input.direction)
  const amount = Number(input.amount)
  const memoryEnabled = input.memory !== false
  const now = input.now ?? Date.now()

  const withMemory = computeLimit(interactions, lender, borrower, { memoryEnabled: true, now })
  const withoutMemory = computeLimit(interactions, lender, borrower, { memoryEnabled: false, now })
  const used = memoryEnabled ? withMemory : withoutMemory
  const decision = verdictFor(amount, used.limit)
  const comparison = verdictFor(amount, withoutMemory.limit)
  const comparisonOn = verdictFor(amount, withMemory.limit)

  return {
    direction: key,
    label,
    lender,
    borrower,
    amount,
    purpose: String(input.purpose ?? '').trim() || 'Unspecified credit request',
    memoryEnabled,
    verdict: decision.verdict,
    approvedAmount: decision.approvedAmount,
    reason: decision.reason,
    limit: used.limit,
    rawLimit: used.rawLimit,
    breakdown: used.breakdown,
    relevant: used.relevant,
    recentSuccesses: used.recentSuccesses,
    recentBonus: used.recentBonus,
    memoryOff: {
      limit: withoutMemory.limit,
      verdict: comparison.verdict,
      approvedAmount: comparison.approvedAmount,
    },
    memoryOn: {
      limit: withMemory.limit,
      verdict: comparisonOn.verdict,
      approvedAmount: comparisonOn.approvedAmount,
      recentSuccesses: withMemory.recentSuccesses,
      recentBonus: withMemory.recentBonus,
    },
    formula: used.formula,
    evaluatedAt: new Date(now).toISOString(),
  }
}
