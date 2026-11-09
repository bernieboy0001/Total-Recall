import { Router } from 'express'
import { evaluateRequest, computeLimit, directionParties, normalizeDirection } from '../credit/engine.mjs'
import { recallAll, rememberInteraction } from '../memory.mjs'
import {
  PaymentNotConfiguredError,
  dryRunPayment,
  executePayment,
  getBalances,
  paymentConfig,
} from '../sui-payment.mjs'
import { MissingApiKeyError } from '../tatum-client.mjs'

const router = Router()
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

function statusForError(error) {
  if (error instanceof PaymentNotConfiguredError) return 503
  if (error instanceof MissingApiKeyError) return 503
  return 500
}

async function gate(body) {
  const cfg = paymentConfig()
  const direction = body?.direction ?? 'alice_to_bob'
  normalizeDirection(direction)
  const { lender, borrower, label } = directionParties(direction)
  const requestedAmount = Number(body?.requestedAmount ?? body?.amount ?? cfg.amount)
  const paymentAmount = Number(cfg.amount)

  const recall = await recallAll()
  const limit = computeLimit(recall.interactions, lender, borrower, { memoryEnabled: true })
  const decision = evaluateRequest(recall.interactions, {
    direction,
    amount: requestedAmount,
    purpose: body?.purpose,
    memory: true,
  })

  const paymentAllowed = limit.limit >= paymentAmount
  const allowed = decision.verdict === 'ALLOW' && paymentAllowed

  return {
    cfg,
    direction,
    lender,
    borrower,
    label,
    requestedAmount,
    paymentAmount,
    memoryCount: recall.interactions.length,
    decision,
    limit,
    allowed,
    reason: !paymentAllowed
      ? `Reconstructed limit ${limit.limit} ${cfg.symbol} is below the ${paymentAmount} ${cfg.symbol} agent payment.`
      : decision.verdict !== 'ALLOW'
        ? decision.reason
        : `Credit request is inside the ${limit.limit} ${cfg.symbol} limit; the agent may release ${paymentAmount} ${cfg.symbol}.`,
  }
}

router.get(
  '/config',
  wrap(async (_req, res) => {
    const cfg = paymentConfig()
    const balances = cfg.hasKey ? await getBalances() : null
    res.json({
      ...cfg,
      balances,
      gate: 'A payment is only released when the current Walrus-reconstructed limit covers both the credit request and the tiny agent transfer.',
    })
  }),
)

router.get(
  '/balance',
  wrap(async (_req, res) => {
    res.json(await getBalances())
  }),
)

router.post(
  '/authorize',
  wrap(async (req, res) => {
    const g = await gate(req.body)
    const base = {
      allowed: g.allowed,
      reason: g.reason,
      direction: g.direction,
      label: g.label,
      lender: g.lender,
      borrower: g.borrower,
      requestedAmount: g.requestedAmount,
      paymentAmount: g.paymentAmount,
      symbol: g.cfg.symbol,
      coinType: g.cfg.coinType,
      network: g.cfg.network,
      limit: g.limit.limit,
      memoryCount: g.memoryCount,
      decision: {
        verdict: g.decision.verdict,
        approvedAmount: g.decision.approvedAmount,
        reason: g.decision.reason,
      },
    }

    if (!g.allowed) {
      return res.status(403).json({ ...base, payment: null, error: g.reason })
    }

    if (!g.cfg.hasKey) {
      return res.json({
        ...base,
        payment: {
          mode: 'authorization-only',
          configured: false,
          message:
            'Credit policy cleared the payment. Set SUI_AGENT_PRIVATE_KEY (and TATUM_API_KEY) for a live Tatum Sui dry-run or transfer.',
        },
      })
    }

    try {
      const dry = await dryRunPayment({ amount: g.paymentAmount })
      return res.json({
        ...base,
        payment: {
          mode: 'dry-run',
          configured: true,
          sender: dry.sender,
          recipient: dry.recipient,
          amount: dry.amount,
          symbol: dry.symbol,
          coinType: dry.coinType,
          network: dry.network,
          gasBudgetMist: dry.gasBudgetMist,
          dryRun: dry.dryRun,
        },
      })
    } catch (error) {
      return res.status(statusForError(error)).json({ ...base, payment: null, error: error?.message ?? String(error) })
    }
  }),
)

router.post(
  '/execute',
  wrap(async (req, res) => {
    const g = await gate(req.body)
    if (!g.allowed) {
      return res.status(403).json({ allowed: false, error: g.reason, decision: g.decision, limit: g.limit.limit })
    }
    if (!g.cfg.hasKey) {
      return res.status(503).json({
        allowed: true,
        error: 'Live agent payments are not configured. Set SUI_AGENT_PRIVATE_KEY and TATUM_API_KEY.',
      })
    }

    let payment
    try {
      payment = await executePayment({ amount: g.paymentAmount })
    } catch (error) {
      return res.status(statusForError(error)).json({ allowed: true, error: error?.message ?? String(error) })
    }

    let memory = null
    let memoryError = null
    if (payment.execution?.success) {
      try {
        memory = await rememberInteraction({
          type: 'advance',
          from: g.lender,
          to: g.borrower,
          amount: g.paymentAmount,
          result: 'success',
          note: `agent payment ${payment.symbol} ${payment.amount} tx ${payment.digest ?? 'pending'}`,
        })
      } catch (error) {
        memoryError = error?.message ?? String(error)
      }
    }

    const recall = await recallAll()
    const next = computeLimit(recall.interactions, g.lender, g.borrower, { memoryEnabled: true })

    res.json({
      allowed: true,
      direction: g.direction,
      label: g.label,
      lender: g.lender,
      borrower: g.borrower,
      digest: payment.digest,
      explorerUrl: payment.explorerUrl,
      sender: payment.sender,
      recipient: payment.recipient,
      amount: payment.amount,
      symbol: payment.symbol,
      execution: payment.execution,
      memory,
      memoryError,
      limitBefore: g.limit.limit,
      limitAfter: next.limit,
      memoryCount: recall.interactions.length,
    })
  }),
)

export default router
