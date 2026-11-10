import { Router } from 'express'
import {
  evaluateRequest,
  computeState,
  normalizeDirection,
  BASE_LIMIT,
  directionParties,
} from '../credit/engine.mjs'
import { serializeInteraction } from '../credit/schema.mjs'
import { recallAll, rememberInteraction, seedMemories, memoryStatus, isMock, memoryConfig } from '../memory.mjs'
import { paymentConfig, getBalances } from '../sui-payment.mjs'
import { tatumApiBase } from '../tatum-client.mjs'
import { fingerprint } from '../fingerprint.mjs'

const router = Router()
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

async function buildStatePayload(memoryEnabled) {
  const recall = await recallAll()
  const state = computeState(recall.interactions, { memoryEnabled })
  const status = await memoryStatus()

  const directions = {}
  for (const key of ['alice_to_bob', 'bob_to_alice']) {
    const direction = state.directions[key]
    directions[key] = {
      limit: direction.limit,
      rawLimit: direction.rawLimit,
      breakdown: direction.breakdown,
      recentSuccesses: direction.recentSuccesses,
      recentBonus: direction.recentBonus,
      formula: direction.formula,
    }
  }

  return {
    ...status,
    memoryEnabled,
    memoryCount: recall.interactions.length,
    recallTotal: recall.total,
    recallLimit: recall.recallLimit,
    truncated: recall.truncated,
    recallErrors: recall.errors,
    limits: {
      alice_to_bob: state.aliceToBobLimit,
      bob_to_alice: state.bobToAliceLimit,
    },
    directions,
    evidence: memoryEnabled ? recall.interactions : [],
    lastUpdated: state.lastUpdated,
    fingerprint: fingerprint(recall.interactions),
    baseLimit: BASE_LIMIT,
  }
}

router.get(
  '/state',
  wrap(async (req, res) => {
    const memoryEnabled = String(req.query.memory ?? 'on').toLowerCase() !== 'off'
    const payload = await buildStatePayload(memoryEnabled)
    res.json(payload)
  }),
)

router.post(
  '/evaluate',
  wrap(async (req, res) => {
    const { direction, amount, purpose } = req.body ?? {}
    const memoryEnabled = req.body?.memory !== false
    try {
      normalizeDirection(direction)
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
    const numeric = Number(amount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' })
    }

    const recall = await recallAll()
    const decision = evaluateRequest(recall.interactions, {
      direction,
      amount: numeric,
      purpose,
      memory: memoryEnabled,
    })
    const state = computeState(recall.interactions, { memoryEnabled: true })

    res.json({
      ...decision,
      memoryCount: recall.interactions.length,
      memoryMode: (await memoryStatus()).mode,
      source: isMock() ? 'mock' : 'walrus',
      namespace: memoryConfig().namespace,
      state: {
        limits: { alice_to_bob: state.aliceToBobLimit, bob_to_alice: state.bobToAliceLimit },
        memoryCount: recall.interactions.length,
      },
      fingerprint: fingerprint(recall.interactions),
    })
  }),
)

router.get(
  '/history',
  wrap(async (req, res) => {
    const filter = String(req.query.type ?? 'all').toLowerCase()
    const recall = await recallAll()
    const all = recall.interactions
    const interactions = filter === 'all' ? all : all.filter(i => i.type === filter)
    const counts = all.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] ?? 0) + 1
      return acc
    }, {})

    res.json({
      interactions,
      total: interactions.length,
      namespaceTotal: all.length,
      counts,
      filter,
      truncated: recall.truncated,
      mode: recall.mode,
      namespace: recall.namespace,
      fingerprint: fingerprint(all),
      lastUpdated: new Date().toISOString(),
    })
  }),
)

router.post(
  '/record',
  wrap(async (req, res) => {
    const body = req.body ?? {}
    const type = String(body.type ?? '').toLowerCase()
    if (!['repayment', 'default', 'advance', 'fulfillment', 'request'].includes(type)) {
      return res.status(400).json({ error: 'type must be repayment, default, advance, fulfillment, or request' })
    }
    const from = String(body.from ?? '').toLowerCase()
    const to = String(body.to ?? '').toLowerCase()
    const amount = Number(body.amount)
    const result = String(body.result ?? (type === 'default' ? 'failed' : 'success')).toLowerCase()

    try {
      serializeInteraction({ type, from, to, amount, result, note: body.note, timestamp: body.timestamp })
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }

    const memory = await rememberInteraction({
      type,
      from,
      to,
      amount,
      result,
      note: body.note,
      timestamp: body.timestamp,
    })
    const recall = await recallAll()
    const state = computeState(recall.interactions, { memoryEnabled: true })

    res.json({
      memory,
      state: {
        limits: { alice_to_bob: state.aliceToBobLimit, bob_to_alice: state.bobToAliceLimit },
        memoryCount: recall.interactions.length,
        lastUpdated: state.lastUpdated,
      },
      fingerprint: fingerprint(recall.interactions),
      source: isMock() ? 'mock' : 'walrus',
    })
  }),
)

router.post(
  '/seed',
  wrap(async (req, res) => {
    const result = await seedMemories({ force: Boolean(req.body?.force) })
    const recall = await recallAll()
    const state = computeState(recall.interactions, { memoryEnabled: true })
    res.json({
      ...result,
      memoryCount: recall.interactions.length,
      limits: { alice_to_bob: state.aliceToBobLimit, bob_to_alice: state.bobToAliceLimit },
      fingerprint: fingerprint(recall.interactions),
    })
  }),
)

router.post(
  '/verify',
  wrap(async (req, res) => {
    const expected = String(req.body?.fingerprint ?? '')
    const recall = await recallAll()
    const current = fingerprint(recall.interactions)
    const state = computeState(recall.interactions, { memoryEnabled: true })
    res.json({
      matches: Boolean(expected) && (expected === current.short || expected === current.full),
      expected: expected || null,
      current,
      limits: { alice_to_bob: state.aliceToBobLimit, bob_to_alice: state.bobToAliceLimit },
      memoryCount: recall.interactions.length,
      namespace: recall.namespace,
      mode: recall.mode,
    })
  }),
)

router.post(
  '/reset-mock',
  wrap(async (_req, res) => {
    if (!isMock()) return res.status(409).json({ error: 'reset-mock only applies in mock mode' })
    const { destroyMemoryClient } = await import('../memory.mjs')
    destroyMemoryClient()
    const payload = await buildStatePayload(true)
    res.json(payload)
  }),
)

router.get(
  '/status',
  wrap(async (_req, res) => {
    const memory = await memoryStatus()
    const payment = paymentConfig()
    const balances = payment.hasKey ? await getBalances() : null

    let tatum = { status: 'no-api-key' }
    if (process.env.TATUM_API_KEY) {
      try {
        await fetch(tatumApiBase(), { signal: AbortSignal.timeout(6000) })
        tatum = { status: 'connected' }
      } catch (error) {
        tatum = { status: 'egress-failed', error: error?.message ?? String(error) }
      }
    }

    res.json({
      memory,
      tatum,
      payment: {
        enabled: payment.enabled,
        configured: payment.configured,
        hasKey: payment.hasKey,
        tatumConfigured: payment.tatumConfigured,
        symbol: payment.symbol,
        coinType: payment.coinType,
        decimals: payment.decimals,
        amount: payment.amount,
        recipient: payment.recipient || null,
        network: payment.network,
        balances,
      },
    })
  }),
)

router.get(
  '/directions',
  wrap(async (_req, res) => {
    res.json({
      directions: {
        alice_to_bob: directionParties('alice_to_bob'),
        bob_to_alice: directionParties('bob_to_alice'),
      },
      baseLimit: BASE_LIMIT,
      namespace: memoryConfig().namespace,
    })
  }),
)

export default router
