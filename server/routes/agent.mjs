import { Router } from 'express'
import {
  evaluateRequest,
  computeState,
  normalizeDirection,
  directionParties,
} from '../credit/engine.mjs'
import { rememberInteraction, recallAll } from '../memory.mjs'
import {
  paymentConfig,
  dryRunPayment,
  executePayment,
  PaymentNotConfiguredError,
} from '../sui-payment.mjs'
import { MissingApiKeyError } from '../tatum-client.mjs'
import { fingerprint } from '../fingerprint.mjs'

const router = Router()
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Absolute ceiling on what the agent may release without a human in the loop.
// Configurable via AGENT_MAX_RELEASE; defaults to 0.05 of the payment coin.
const DEFAULT_MAX_RELEASE = 0.05

const railFor = value => {
  const rail = String(value ?? 'dry-run').toLowerCase()
  return rail === 'none' || rail === 'dry-run' || rail === 'execute' ? rail : null
}

/**
 * POST /api/agent/request
 * Body: { direction?, amount, purpose?, rail? ('none'|'dry-run'|'execute', default 'dry-run'), maxRelease? }
 *
 * The agent acts autonomously inside hard limits:
 *   1. recall the namespace — no memory, base-10 policy
 *   2. credit request must be inside the reconstructed limit (ALLOW)
 *   3. released payment must be <= maxRelease (default 0.05 / AGENT_MAX_RELEASE)
 * Anything else defers to a human. A successful release is written back to
 * Walrus so the next request sees it.
 */
router.post(
  '/request',
  wrap(async (req, res) => {
    const body = req.body ?? {}
    const direction = body.direction ?? 'alice_to_bob'
    const rail = railFor(body.rail)
    if (!rail) {
      return res.status(400).json({ error: "rail must be 'none', 'dry-run' or 'execute'" })
    }
    try {
      normalizeDirection(direction)
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
    const numeric = Number(body.amount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' })
    }

    const cfg = paymentConfig()
    const paymentAmount = Number(cfg.amount)
    const maxRelease = Number(body.maxRelease ?? process.env.AGENT_MAX_RELEASE ?? DEFAULT_MAX_RELEASE)
    if (!Number.isFinite(maxRelease) || maxRelease <= 0) {
      return res.status(400).json({ error: 'maxRelease must be a positive number' })
    }
    if (paymentAmount > maxRelease) {
      return res.status(403).json({
        error: `Payment amount ${paymentAmount} ${cfg.symbol} exceeds the agent safety cap of ${maxRelease} ${cfg.symbol}.`,
        released: false,
      })
    }

    const recall = await recallAll()
    const decision = evaluateRequest(recall.interactions, {
      direction,
      amount: numeric,
      purpose: body.purpose,
      memory: true,
    })
    const { lender, borrower, label } = directionParties(direction)
    const autoApprovable = decision.verdict === 'ALLOW'
    const base = {
      agent: true,
      direction,
      label,
      lender,
      borrower,
      requestedAmount: numeric,
      purpose: decision.purpose,
      paymentAmount,
      maxRelease,
      symbol: cfg.symbol,
      network: cfg.network,
      rail,
      verdict: decision.verdict,
      reason: decision.reason,
      limit: decision.limit,
      autoApproved: autoApprovable,
      released: false,
      decision,
      payment: null,
      memory: null,
      memoryError: null,
      memoryCount: recall.interactions.length,
      fingerprint: fingerprint(recall.interactions),
    }

    if (!autoApprovable) {
      return res.json({
        ...base,
        deferReason:
          decision.verdict === 'REDUCE'
            ? `Amount exceeds the limit; the agent may not partially approve. Human sign-off required.`
            : 'Agent does not release outside the reconstructed limit.',
      })
    }

    if (rail === 'none') {
      return res.json({ ...base, deferReason: null })
    }

    // Authorize + run the payment rail through Tatum. The gate is belt-and-braces:
    // even inside the cap we still re-check the limit at call time.
    try {
      const result =
        rail === 'execute'
          ? await executePayment({ amount: paymentAmount })
          : await dryRunPayment({ amount: paymentAmount })

      const amount = Number(result.amount)
      const payment =
        rail === 'execute'
          ? {
              mode: 'execution',
              configured: true,
              digest: result.digest,
              explorerUrl: result.explorerUrl,
              execution: result.execution ?? null,
              symbol: result.symbol,
              amount,
            }
          : {
              mode: 'dry-run',
              configured: true,
              digest: result.dryRun?.digest ?? null,
              dryRun: result.dryRun,
              symbol: result.symbol,
              amount,
            }

      const executedOk = rail === 'execute' && Boolean(result.execution?.success)
      let memory = null
      let memoryError = null
      if (executedOk) {
        try {
          memory = await rememberInteraction({
            type: 'advance',
            from: decision.lender,
            to: decision.borrower,
            amount: amount,
            result: 'success',
            note: `agent-release ${cfg.symbol} ${amount} tx ${result.digest ?? 'pending'}`,
          })
        } catch (error) {
          memoryError = error?.message ?? String(error)
        }
      }

      const afterRecall = await recallAll()
      const state = computeState(afterRecall.interactions, { memoryEnabled: true })
      return res.json({
        ...base,
        released: executedOk,
        rail,
        payment,
        memory,
        memoryError,
        memoryCount: afterRecall.interactions.length,
        fingerprint: fingerprint(afterRecall.interactions),
        limits: {
          alice_to_bob: state.aliceToBobLimit,
          bob_to_alice: state.bobToAliceLimit,
        },
        limitAfter: state.directions[direction].limit,
        deferReason: null,
      })
    } catch (error) {
      const configuredError =
        error instanceof PaymentNotConfiguredError || error instanceof MissingApiKeyError
      if (configuredError) {
        return res.json({
          ...base,
          payment: {
            mode: 'authorization-only',
            configured: false,
            message:
              'Credit policy cleared the payment. Set SUI_AGENT_PRIVATE_KEY and TATUM_API_KEY for a live Tatum dry-run or transfer.',
          },
          deferReason: null,
        })
      }
      return res.status(500).json({ error: error?.message ?? String(error) })
    }
  }),
)

export default router
