import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Coins,
  Copy,
  Database,
  FileCheck2,
  Fingerprint,
  History,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react'
import {
  api,
  type AppStatus,
  type BreakdownItem,
  type CreditState,
  type Decision,
  type Direction,
  type HistoryResponse,
  type Interaction,
  type InteractionType,
  type PaymentAuthorization,
  type PaymentExecution,
  type Verdict,
} from './lib/api'

type Tab = 'dashboard' | 'request' | 'decision' | 'history'

// Credit amounts are denominated in the same unit the agent rail moves.
const CREDIT_UNIT = 'SUI'

const DIRECTION_LABEL: Record<Direction, string> = {
  alice_to_bob: 'Alice → Bob',
  bob_to_alice: 'Bob → Alice',
}

const TYPE_TONE: Record<InteractionType, string> = {
  repayment: 'success',
  default: 'error',
  advance: 'brand',
  fulfillment: 'gray',
  request: 'warning',
}

function fmt(value: number, digits = 1) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtAmount(value: number) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function shortBlob(blobId?: string | null) {
  if (!blobId) return 'no blob id'
  if (blobId.length <= 22) return blobId
  return `${blobId.slice(0, 12)}…${blobId.slice(-6)}`
}

function shortAddress(address?: string | null) {
  if (!address) return 'not configured'
  if (address.length <= 18) return address
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function timeAgo(timestamp: string) {
  const then = new Date(timestamp).getTime()
  if (Number.isNaN(then)) return 'unknown'
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function fmtDate(timestamp: string) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Badge({
  children,
  tone = 'gray',
  dot = false,
}: {
  children: React.ReactNode
  tone?: 'gray' | 'brand' | 'success' | 'warning' | 'error'
  dot?: boolean
}) {
  const tones: Record<string, string> = {
    gray: 'border-utility-gray-200 bg-utility-gray-50 text-utility-gray-700',
    brand: 'border-utility-brand-200 bg-utility-brand-50 text-utility-brand-700',
    success: 'border-utility-success-200 bg-utility-success-50 text-utility-success-700',
    warning: 'border-utility-warning-200 bg-utility-warning-50 text-utility-warning-700',
    error: 'border-utility-error-200 bg-utility-error-50 text-utility-error-700',
  }
  const dots: Record<string, string> = {
    gray: 'bg-utility-gray-600',
    brand: 'bg-utility-brand-600',
    success: 'bg-utility-success-600',
    warning: 'bg-utility-warning-600',
    error: 'bg-utility-error-600',
  }
  return (
    <span
      className={`inline-flex items-center gap-xs rounded-full border px-md py-xxs text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {dot && <span className={`size-1.5 rounded-full ${dots[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  )
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  if (verdict === 'ALLOW') {
    return (
      <Badge tone="success">
        <CheckCircle2 className="size-3.5" /> ALLOW
      </Badge>
    )
  }
  if (verdict === 'REDUCE') {
    return (
      <Badge tone="warning">
        <AlertTriangle className="size-3.5" /> REDUCE
      </Badge>
    )
  }
  return (
    <Badge tone="error">
      <XCircle className="size-3.5" /> BLOCK
    </Badge>
  )
}

function typeIcon(type: InteractionType) {
  if (type === 'repayment') return <TrendingUp className="size-4" />
  if (type === 'default') return <TrendingDown className="size-4" />
  if (type === 'advance') return <Coins className="size-4" />
  if (type === 'fulfillment') return <Sparkles className="size-4" />
  return <FileCheck2 className="size-4" />
}

function ContributionBar({ direction }: { direction: CreditState['directions']['alice_to_bob'] }) {
  const positive = direction.breakdown.filter(item => item.delta > 0).reduce((sum, item) => sum + item.delta, 0)
  const negative = direction.breakdown.filter(item => item.delta < 0).reduce((sum, item) => sum + Math.abs(item.delta), 0)
  const base = 10
  const recency = direction.recentBonus
  const total = Math.max(base + positive + recency + negative, 0.001)
  const seg = (value: number) => `${Math.max(0, (value / total) * 100)}%`

  return (
    <div className="mt-lg">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-tertiary">
        <span className="bg-utility-gray-600" style={{ width: seg(base) }} title={`Base ${base}`} />
        <span className="bg-utility-success-600" style={{ width: seg(positive) }} title={`Repayments +${positive}`} />
        <span className="bg-utility-brand-600" style={{ width: seg(recency) }} title={`Recency +${recency}`} />
        <span className="bg-utility-error-600" style={{ width: seg(negative) }} title={`Drawdowns −${negative}`} />
      </div>
      <div className="mt-sm flex flex-wrap items-center gap-x-md gap-y-xs text-[11px] text-tertiary">
        <span>Base 10</span>
        <span className="text-utility-success-700">+ repayments {fmt(positive)}</span>
        <span className="text-utility-brand-700">+ recency {fmt(recency)}</span>
        <span className="text-utility-error-700">− drawdowns {fmt(negative)}</span>
      </div>
    </div>
  )
}

function LimitCard({
  directionKey,
  direction,
  memoryCount,
  source,
  updatedAt,
}: {
  directionKey: Direction
  direction: CreditState['directions']['alice_to_bob']
  memoryCount: number
  source: 'walrus' | 'mock'
  updatedAt: string
}) {
  const [lender, borrower] = directionKey === 'alice_to_bob' ? ['Alice', 'Bob'] : ['Bob', 'Alice']

  return (
    <article className="rounded-2xl border border-secondary bg-primary p-2xl shadow-xs flex flex-col">
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">Bilateral credit line</p>
          <h2 className="mt-xxs text-heading-xs font-semibold text-primary">
            {lender} <span className="text-fg-quaternary">→</span> {borrower}
          </h2>
        </div>
        <Badge tone={source === 'walrus' ? 'success' : 'warning'} dot>
          {source === 'walrus' ? 'Walrus' : 'Demo'}
        </Badge>
      </div>

      <div className="mt-xl flex items-end gap-sm">
        <span className="text-heading-2xl font-semibold leading-none tracking-tight text-primary tabular-nums">
          {fmt(direction.limit)}
        </span>
        <span className="mb-sm text-sm font-medium text-tertiary">{CREDIT_UNIT}</span>
      </div>
      <p className="mt-sm text-xs text-tertiary">
        Rebuilt from {memoryCount} memories · {timeAgo(updatedAt)}
      </p>

      <ContributionBar direction={direction} />

      <div className="mt-xl grid grid-cols-3 gap-sm border-t border-secondary pt-lg">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-quaternary">Repayments</p>
          <p className="mt-xxs text-sm font-semibold text-utility-success-700 tabular-nums">
            {direction.breakdown.filter(i => i.delta > 0).length}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-quaternary">7-day hits</p>
          <p className="mt-xxs text-sm font-semibold text-primary tabular-nums">{direction.recentSuccesses}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-quaternary">Drawdowns</p>
          <p className="mt-xxs text-sm font-semibold text-utility-error-700 tabular-nums">
            {fmt(direction.breakdown.filter(i => i.delta < 0).reduce((sum, i) => sum + Math.abs(i.delta), 0))}
          </p>
        </div>
      </div>
    </article>
  )
}

function MemoryRow({
  interaction,
  delta,
  compact = false,
}: {
  interaction: Interaction
  delta?: number
  compact?: boolean
}) {
  const tone = TYPE_TONE[interaction.type] as 'gray' | 'brand' | 'success' | 'warning' | 'error'
  return (
    <li className="flex items-start gap-md rounded-xl border border-secondary bg-primary px-lg py-md">
      <span
        className={`mt-xxs flex size-8 shrink-0 items-center justify-center rounded-full border ${
          tone === 'success'
            ? 'border-utility-success-200 bg-utility-success-50 text-utility-success-700'
            : tone === 'error'
              ? 'border-utility-error-200 bg-utility-error-50 text-utility-error-700'
              : tone === 'brand'
                ? 'border-utility-brand-200 bg-utility-brand-50 text-utility-brand-700'
                : 'border-utility-gray-200 bg-utility-gray-50 text-utility-gray-700'
        }`}
      >
        {typeIcon(interaction.type)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-sm gap-y-xs">
          <Badge tone={tone}>{interaction.type}</Badge>
          <span className="text-xs font-medium text-secondary">
            {interaction.from} → {interaction.to}
          </span>
          <span className="text-xs font-semibold text-primary tabular-nums">{fmtAmount(interaction.amount)}</span>
          {interaction.result !== 'success' && <Badge tone="error">{interaction.result}</Badge>}
          {typeof delta === 'number' && delta !== 0 && (
            <span
              className={`rounded-full px-sm py-xxs text-[11px] font-semibold tabular-nums ${
                delta > 0 ? 'bg-utility-success-50 text-utility-success-700' : 'bg-utility-error-50 text-utility-error-700'
              }`}
            >
              {delta > 0 ? '+' : ''}
              {fmt(delta)}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-quaternary" title={interaction.blobId ?? undefined}>
            {shortBlob(interaction.blobId)}
          </span>
        </div>
        <p className="mt-xxs truncate text-xs text-tertiary">
          {interaction.note || interaction.text}
          <span className="ml-sm text-quaternary">· {timeAgo(interaction.timestamp)}</span>
        </p>
        {!compact && (
          <p className="mt-xxs truncate font-mono text-[10px] text-quaternary" title={interaction.text}>
            {interaction.text}
          </p>
        )}
      </div>
    </li>
  )
}

function FormulaPanel() {
  return (
    <div className="rounded-2xl border border-secondary bg-primary p-xl">
      <div className="flex items-center gap-sm">
        <ShieldCheck className="size-4 text-fg-brand-primary" />
        <h3 className="text-sm font-semibold text-primary">The whole policy</h3>
      </div>
      <div className="mt-md space-y-xs font-mono text-[11px] leading-5 text-secondary">
        <p>limit = 10</p>
        <p className="text-utility-success-700">+ min(amount × 0.5, 8) · successful repayment</p>
        <p className="text-utility-error-700">− 15 · default or failed repayment</p>
        <p className="text-utility-error-700">− amount × 0.2 · open advance</p>
        <p className="text-utility-brand-700">+ 2 · borrower success in last 7 days</p>
        <p>floor at 0 · one decimal</p>
      </div>
      <p className="mt-md text-xs text-tertiary">
        No database, no cache, no stored limit. The same blobs always produce the same number.
      </p>
    </div>
  )
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">{eyebrow}</p>
        <h2 className="mt-xxs text-heading-xs font-semibold text-primary">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-xs rounded-md border border-secondary bg-primary px-sm py-xxs text-[11px] font-medium text-secondary hover:bg-primary-hover"
    >
      {copied ? <Check className="size-3 text-fg-success-primary" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-sm">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </span>
  )
}

export function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [state, setState] = useState<CreditState | null>(null)
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [historyFilter, setHistoryFilter] = useState<string>('all')
  const [decision, setDecision] = useState<Decision | null>(null)
  const [paymentAuth, setPaymentAuth] = useState<PaymentAuthorization | null>(null)
  const [paymentExec, setPaymentExec] = useState<PaymentExecution | null>(null)
  const [outcomeNote, setOutcomeNote] = useState('')
  const [reqDirection, setReqDirection] = useState<Direction>('alice_to_bob')
  const [reqAmount, setReqAmount] = useState('25')
  const [reqPurpose, setReqPurpose] = useState('Short-term settlement buffer')
  const [busy, setBusy] = useState<string | null>('state')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<'match' | 'changed' | null>(null)

  const clearAlerts = () => {
    setError(null)
    setNotice(null)
  }

  const loadState = useCallback(async (memory: boolean) => {
    setBusy('state')
    try {
      const next = await api.state(memory)
      setState(next)
      return next
    } finally {
      setBusy(null)
    }
  }, [])

  const loadHistory = useCallback(async (filter: string) => {
    const next = await api.history(filter)
    setHistory(next)
    return next
  }, [])

  const loadStatus = useCallback(async () => {
    try {
      const next = await api.status()
      setStatus(next)
    } catch {
      // Status is supplementary; the dashboard still works without it.
    }
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([api.state(true), api.history('all'), api.status()])
      .then(([nextState, nextHistory, nextStatus]) => {
        if (!alive) return
        setState(nextState)
        setHistory(nextHistory)
        setStatus(nextStatus)
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setBusy(null)
      })
    return () => {
      alive = false
    }
  }, [])

  const refreshAll = async (filter = historyFilter) => {
    await Promise.all([loadState(memoryEnabled), loadHistory(filter), loadStatus()])
  }

  const handleToggleMemory = async () => {
    const next = !memoryEnabled
    setMemoryEnabled(next)
    setVerifyResult(null)
    clearAlerts()
    try {
      await loadState(next)
      if (decision) {
        const recalculated = await api.evaluate({
          direction: decision.direction,
          amount: decision.amount,
          purpose: decision.purpose,
          memory: next,
        })
        setDecision(recalculated)
        setPaymentAuth(null)
        setPaymentExec(null)
      }
      setNotice(
        next
          ? 'Memory is back on. Limits are rebuilt from every recalled interaction.'
          : 'Memory is off. The policy returns the base limit of 10 with no history.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleEvaluate = async (event: React.FormEvent) => {
    event.preventDefault()
    clearAlerts()
    const amount = Number(reqAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive request amount.')
      return
    }
    setBusy('evaluate')
    try {
      const next = await api.evaluate({
        direction: reqDirection,
        amount,
        purpose: reqPurpose,
        memory: memoryEnabled,
      })
      setDecision(next)
      setPaymentAuth(null)
      setPaymentExec(null)
      setTab('decision')
      await loadHistory(historyFilter)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handleRecord = async (kind: 'repayment' | 'default' | 'advance') => {
    if (!decision) return
    clearAlerts()
    setBusy(`record-${kind}`)
    const from = kind === 'advance' ? decision.lender : decision.borrower
    const to = kind === 'advance' ? decision.borrower : decision.lender
    const result = kind === 'default' ? 'failed' : 'success'
    try {
      const written = await api.record({
        type: kind,
        from,
        to,
        amount: decision.amount,
        result,
        note: outcomeNote || `recorded after ${decision.label} decision`,
      })
      const next = await api.evaluate({
        direction: decision.direction,
        amount: decision.amount,
        purpose: decision.purpose,
        memory: true,
      })
      setDecision(next)
      setPaymentAuth(null)
      setPaymentExec(null)
      setOutcomeNote('')
      await Promise.all([loadState(true), loadHistory(historyFilter)])
      setNotice(
        `Wrote ${kind} memory ${shortBlob(written.memory.blobId)}. Limit is now ${fmt(
          next.limit,
        )} for ${next.label}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handleSeed = async () => {
    clearAlerts()
    setBusy('seed')
    try {
      const seeded = await api.seed(false)
      setNotice(
        seeded.alreadySeeded
          ? 'The namespace already holds the 15-memory seed set.'
          : `Seeded ${seeded.seeded.length} memories${seeded.errors.length ? `, ${seeded.errors.length} failed` : ''}.`,
      )
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handleVerify = async () => {
    if (!state) return
    clearAlerts()
    setBusy('verify')
    try {
      const result = await api.verify(state.fingerprint.short)
      setVerifyResult(result.matches ? 'match' : 'changed')
      setNotice(
        result.matches
          ? `Same fingerprint after a full re-recall: ${result.current.short}. The limit is reproducible.`
          : `Fingerprint changed to ${result.current.short}. New memories were written since the last view.`,
      )
      await loadState(memoryEnabled)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handleFilter = async (filter: string) => {
    setHistoryFilter(filter)
    clearAlerts()
    setBusy('history')
    try {
      await loadHistory(filter)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handleAuthorizePayment = async () => {
    if (!decision) return
    clearAlerts()
    setBusy('authorize')
    setPaymentExec(null)
    try {
      const result = await api.authorizePayment({
        direction: decision.direction,
        requestedAmount: decision.amount,
        purpose: decision.purpose,
      })
      setPaymentAuth(result)
      if (result.payment?.dryRun?.success) {
        setNotice(`Tatum Sui dry-run succeeded for ${result.paymentAmount} ${result.symbol}.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handleExecutePayment = async () => {
    if (!decision) return
    clearAlerts()
    setBusy('execute')
    try {
      const result = await api.executePayment({
        direction: decision.direction,
        requestedAmount: decision.amount,
        purpose: decision.purpose,
      })
      setPaymentExec(result)
      if (result.execution?.success) {
        setNotice(`Agent payment executed: ${result.digest?.slice(0, 12)}…`)
        await Promise.all([loadState(true), loadHistory(historyFilter)])
        const next = await api.evaluate({
          direction: decision.direction,
          amount: decision.amount,
          purpose: decision.purpose,
          memory: true,
        })
        setDecision(next)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const latestEvidence = useMemo(() => (state?.evidence ?? []).slice(-6).reverse(), [state])
  const activeDirection = decision?.direction ?? reqDirection
  const activeLimit = state?.limits[activeDirection] ?? 10
  const isWalrus = state?.source === 'walrus'
  const memoryCount = state?.memoryCount ?? 0

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'dashboard', label: 'Overview', icon: <Coins className="size-4" /> },
    { id: 'request', label: 'Request credit', icon: <ArrowRightLeft className="size-4" /> },
    { id: 'decision', label: 'Decision', icon: <FileCheck2 className="size-4" /> },
    { id: 'history', label: 'Memory ledger', icon: <History className="size-4" />, count: history?.namespaceTotal },
  ]

  return (
    <div className="min-h-screen bg-secondary text-primary font-sans antialiased">
      <header className="sticky top-0 z-20 border-b border-secondary bg-primary/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-md px-xl py-lg lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-lg">
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-solid text-fg-white shadow-xs">
              <Brain className="size-5" />
              <span className="absolute -right-1 -top-1 size-2 rounded-full bg-utility-success-600 ring-2 ring-primary" />
            </span>
            <div>
              <div className="flex items-center gap-sm">
                <h1 className="text-lg font-semibold tracking-tight text-primary">Total Recall</h1>
                <Badge tone={isWalrus ? 'success' : 'warning'} dot>
                  {isWalrus ? 'Walrus Memory' : 'Demo memory'}
                </Badge>
              </div>
              <p className="text-xs text-tertiary">Bilateral credit that is rebuilt from what happened.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-md">
            <div className="flex items-center gap-sm rounded-lg border border-secondary bg-secondary px-lg py-sm">
              <div className="text-right">
                <p className="text-[11px] font-semibold text-primary">Memory policy</p>
                <p className="text-[10px] text-tertiary">{memoryEnabled ? 'ON · history enforced' : 'OFF · base 10 only'}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={memoryEnabled}
                onClick={handleToggleMemory}
                className={`flex h-6 w-11 items-center rounded-full p-xxs transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
                  memoryEnabled ? 'bg-brand-solid' : 'bg-tertiary'
                }`}
              >
                <span
                  className={`size-4 rounded-full bg-primary shadow-xs transition-transform duration-200 ${
                    memoryEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                  aria-hidden="true"
                />
              </button>
            </div>
            <button
              type="button"
              onClick={handleVerify}
              disabled={busy === 'verify'}
              className="inline-flex items-center gap-sm rounded-lg border border-secondary bg-primary px-lg py-sm text-xs font-semibold text-secondary shadow-xs hover:bg-primary-hover disabled:opacity-50"
            >
              {busy === 'verify' ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
              Verify rebuild
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-xl">
          <nav className="-mb-px flex gap-lg overflow-x-auto" aria-label="Sections">
            {tabs.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-xs whitespace-nowrap border-b-2 px-md py-sm text-sm font-semibold transition-colors ${
                  tab === item.id
                    ? 'border-brand text-brand-primary'
                    : 'border-transparent text-tertiary hover:text-secondary'
                }`}
              >
                {item.icon}
                {item.label}
                {typeof item.count === 'number' && (
                  <span className="ml-xs rounded-full bg-secondary px-sm py-xxs text-[10px] text-tertiary">{item.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-xl py-3xl">
        {error && (
          <div className="mb-xl flex items-start gap-md rounded-xl border border-utility-error-200 bg-utility-error-50 p-lg">
            <XCircle className="mt-xxs size-5 shrink-0 text-fg-error-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-utility-error-700">Something needs attention</p>
              <p className="mt-xxs text-xs text-utility-error-700/80">{error}</p>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-xs font-semibold text-utility-error-700">
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div className="mb-xl flex items-start gap-md rounded-xl border border-utility-success-200 bg-utility-success-50 p-lg">
            <CheckCircle2 className="mt-xxs size-5 shrink-0 text-fg-success-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-utility-success-700">Memory updated</p>
              <p className="mt-xxs text-xs text-utility-success-700/80">{notice}</p>
            </div>
            <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold text-utility-success-700">
              Dismiss
            </button>
          </div>
        )}

        {!isWalrus && (
          <div className="mb-xl flex flex-col gap-md rounded-xl border border-utility-warning-200 bg-utility-warning-50 p-lg sm:flex-row sm:items-center">
            <AlertTriangle className="size-5 shrink-0 text-fg-warning-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-utility-warning-700">Demo memory is active</p>
              <p className="mt-xxs text-xs text-utility-warning-700/80">
                The dashboard is running on an in-process MemWal mock. Add <code className="font-mono">MEMWAL_ACCOUNT_ID</code> and{' '}
                <code className="font-mono">MEMWAL_PRIVATE_KEY</code> (or set <code className="font-mono">MEMWAL_MODE=live</code>) to write real blobs to the Walrus Memory relayer.
              </p>
            </div>
            {memoryCount < 15 && (
              <button
                type="button"
                onClick={handleSeed}
                disabled={busy === 'seed'}
                className="inline-flex items-center justify-center gap-sm rounded-lg bg-brand-solid px-lg py-sm text-xs font-semibold text-primary-on-brand hover:bg-brand-solid-hover disabled:opacity-60"
              >
                {busy === 'seed' ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
                Seed 15 memories
              </button>
            )}
          </div>
        )}

        {tab === 'dashboard' && (
          <div className="space-y-2xl">
            <section className="grid gap-xl lg:grid-cols-[1.15fr_0.85fr]">
              <div className="relative overflow-hidden rounded-2xl border border-secondary bg-primary p-2xl shadow-xs">
                <div className="flex items-center gap-sm">
                  <Badge tone="brand" dot>
                    Consumer finance · Walrus Memory
                  </Badge>
                  <span className="text-[11px] text-tertiary">namespace: {state?.namespace ?? 'credit-demo'}</span>
                </div>
                <h2 className="mt-lg max-w-xl text-heading-md font-semibold leading-[1.1] tracking-tight text-primary">
                  The limit is not stored.
                  <br />
                  It is <span className="text-brand-primary">remembered</span>.
                </h2>
                <p className="mt-md max-w-xl text-sm leading-6 text-secondary">
                  Every repayment, default, advance, and fulfillment is a sentence in a shared Walrus Memory namespace.
                  The credit engine is a pure function of that history. Restart the backend and the same blobs return the
                  same number.
                </p>
                <div className="mt-xl flex flex-wrap items-center gap-sm">
                  <button
                    type="button"
                    onClick={() => setTab('request')}
                    className="inline-flex items-center gap-sm rounded-lg bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover"
                  >
                    Test a request <ArrowRight className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={busy === 'verify'}
                    className="inline-flex items-center gap-sm rounded-lg border border-secondary bg-primary px-lg py-sm text-sm font-semibold text-secondary shadow-xs hover:bg-primary-hover disabled:opacity-50"
                  >
                    {busy === 'verify' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    Re-recall &amp; compare
                  </button>
                  {verifyResult && (
                    <span
                      className={`inline-flex items-center gap-xs text-xs font-semibold ${
                        verifyResult === 'match' ? 'text-utility-success-700' : 'text-utility-warning-700'
                      }`}
                    >
                      {verifyResult === 'match' ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                      {verifyResult === 'match' ? 'Fingerprint matched' : 'Fingerprint changed'}
                    </span>
                  )}
                </div>

                <div className="mt-xl grid grid-cols-1 gap-sm border-t border-secondary pt-lg sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-quaternary">Memories in policy</p>
                    <p className="mt-xxs text-sm font-semibold text-primary tabular-nums">{memoryCount}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-quaternary">State fingerprint</p>
                    <p className="mt-xxs font-mono text-sm font-semibold text-primary">{state?.fingerprint.short ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-quaternary">Last rebuild</p>
                    <p className="mt-xxs text-sm font-semibold text-primary">{state ? timeAgo(state.lastUpdated) : '—'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-primary-solid p-2xl text-white shadow-xs">
                <div className="flex items-center justify-between">
                  <Badge tone="success" dot>
                    Live from Walrus
                  </Badge>
                  <Fingerprint className="size-5 text-white/40" />
                </div>
                <p className="mt-lg text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Provenance</p>
                <div className="mt-md space-y-sm text-sm">
                  <div className="flex items-center justify-between gap-md border-b border-white/10 pb-sm">
                    <span className="text-white/50">Mode</span>
                    <span className="font-medium">
                      {state?.mode === 'live'
                        ? state.relayer?.includes('dev.memwal.ai')
                          ? 'Walrus testnet'
                          : 'Walrus mainnet'
                        : 'In-process mock'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-md border-b border-white/10 pb-sm">
                    <span className="text-white/50">Relayer</span>
                    <span className="max-w-[190px] truncate font-mono text-xs" title={state?.relayer}>
                      {state?.relayer}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-md border-b border-white/10 pb-sm">
                    <span className="text-white/50">Namespace</span>
                    <span className="font-mono text-xs">{state?.namespace}</span>
                  </div>
                  <div className="flex items-center justify-between gap-md border-b border-white/10 pb-sm">
                    <span className="text-white/50">Account</span>
                    <span className="font-mono text-xs">{state?.accountId ?? 'mock owner'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-md">
                    <span className="text-white/50">Recall window</span>
                    <span className="font-mono text-xs">{state?.recallLimit ?? 100} memories</span>
                  </div>
                </div>
                <div className="mt-lg rounded-lg border border-white/10 bg-white/5 p-md">
                  <p className="text-[11px] leading-5 text-white/60">
                    {state?.liveHint ?? 'Every read is rebuilt from the shared memory namespace.'}
                  </p>
                </div>
                {memoryCount === 0 && (
                  <button
                    type="button"
                    onClick={handleSeed}
                    disabled={busy === 'seed'}
                    className="mt-lg inline-flex w-full items-center justify-center gap-sm rounded-lg bg-white px-lg py-sm text-sm font-semibold text-primary hover:bg-white/90 disabled:opacity-60"
                  >
                    {busy === 'seed' ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
                    Seed the first 15 memories
                  </button>
                )}
              </div>
            </section>

            <section>
              <SectionHeading
                eyebrow="The two books"
                title="Current reconstructed limits"
                action={
                  <div className="flex items-center gap-sm text-xs text-tertiary">
                    <span className={`size-1.5 rounded-full ${memoryEnabled ? 'bg-utility-success-600' : 'bg-utility-gray-600'}`} />
                    {memoryEnabled ? 'Memory on' : 'Memory off · base limit'}
                  </div>
                }
              />
              <div className="mt-lg grid gap-xl md:grid-cols-2">
                <LimitCard
                  directionKey="alice_to_bob"
                  direction={state?.directions.alice_to_bob ?? {
                    limit: 10,
                    rawLimit: 10,
                    breakdown: [],
                    recentSuccesses: 0,
                    recentBonus: 0,
                    formula: {},
                  }}
                  memoryCount={state?.memoryEnabled ? memoryCount : 0}
                  source={isWalrus ? 'walrus' : 'mock'}
                  updatedAt={state?.lastUpdated ?? new Date().toISOString()}
                />
                <LimitCard
                  directionKey="bob_to_alice"
                  direction={state?.directions.bob_to_alice ?? {
                    limit: 10,
                    rawLimit: 10,
                    breakdown: [],
                    recentSuccesses: 0,
                    recentBonus: 0,
                    formula: {},
                  }}
                  memoryCount={state?.memoryEnabled ? memoryCount : 0}
                  source={isWalrus ? 'walrus' : 'mock'}
                  updatedAt={state?.lastUpdated ?? new Date().toISOString()}
                />
              </div>
            </section>

            <section className="grid gap-xl lg:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-2xl border border-secondary bg-primary p-xl shadow-xs">
                <div className="flex items-center justify-between gap-md">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">Evidence</p>
                    <h3 className="mt-xxs text-heading-xs font-semibold text-primary">Latest remembered interactions</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('history')}
                    className="inline-flex items-center gap-xs text-xs font-semibold text-brand-primary hover:underline"
                  >
                    Full ledger <ChevronRight className="size-4" />
                  </button>
                </div>
                {latestEvidence.length === 0 ? (
                  <div className="mt-lg rounded-xl border border-dashed border-primary bg-secondary p-2xl text-center">
                    <p className="text-sm font-semibold text-primary">No credit memories yet</p>
                    <p className="mt-xxs text-xs text-tertiary">Seed the namespace or write the first outcome.</p>
                  </div>
                ) : (
                  <ul className="mt-lg space-y-sm">
                    {latestEvidence.map(item => (
                      <MemoryRow key={item.id} interaction={item} />
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-xl">
                <FormulaPanel />
                <div className="rounded-2xl border border-secondary bg-primary p-xl">
                  <div className="flex items-center gap-sm">
                    <Wallet className="size-4 text-fg-brand-primary" />
                    <h3 className="text-sm font-semibold text-primary">Agent payment rail</h3>
                  </div>
                  <p className="mt-xs text-xs leading-5 text-tertiary">
                    Tatum Sui gateway checks the reconstructed limit before it authorizes a tiny agent transfer.
                  </p>
                  <div className="mt-md space-y-xs text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-tertiary">Tatum</span>
                      <span className="font-medium text-primary">
                        {status?.tatum.status === 'connected' ? 'connected' : status?.tatum.status ?? 'checking'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-tertiary">Agent wallet</span>
                      <span className="font-mono text-primary">
                        {status?.payment.hasKey ? shortAddress(status.payment.balances?.address) : 'not configured'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-tertiary">Transfer</span>
                      <span className="font-medium text-primary">
                        {status?.payment.amount ?? 0.01} {status?.payment.symbol ?? 'SUI'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-md rounded-lg bg-secondary p-md text-[11px] leading-5 text-tertiary">
                    {status?.payment.hasKey
                      ? 'Dry-run and execute become available on an ALLOW decision.'
                      : 'Set SUI_AGENT_PRIVATE_KEY and TATUM_API_KEY to enable a live dry-run or transfer.'}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === 'request' && (
          <section className="mx-auto max-w-3xl">
            <SectionHeading
              eyebrow="New credit request"
              title="Ask the memory, not a database"
              action={<Badge tone={memoryEnabled ? 'success' : 'gray'}>{memoryEnabled ? 'Memory on' : 'Memory off'}</Badge>}
            />
            <form onSubmit={handleEvaluate} className="mt-lg rounded-2xl border border-secondary bg-primary p-2xl shadow-xs">
              <div className="grid gap-xl sm:grid-cols-2">
                {(['alice_to_bob', 'bob_to_alice'] as Direction[]).map(direction => {
                  const active = reqDirection === direction
                  const limit = state?.limits[direction] ?? 10
                  return (
                    <button
                      key={direction}
                      type="button"
                      onClick={() => setReqDirection(direction)}
                      className={`rounded-xl border p-lg text-left transition-colors ${
                        active
                          ? 'border-brand bg-utility-brand-50'
                          : 'border-secondary bg-primary hover:bg-primary-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-primary">{DIRECTION_LABEL[direction]}</span>
                        <span
                          className={`flex size-4 items-center justify-center rounded-full border ${
                            active ? 'border-brand bg-primary' : 'border-primary bg-primary'
                          }`}
                        >
                          {active && <span className="size-2 rounded-full bg-brand-solid" />}
                        </span>
                      </div>
                      <p className="mt-xs text-xs text-tertiary">
                        Current limit <span className="font-semibold text-primary">{fmt(limit)} {CREDIT_UNIT}</span>
                      </p>
                    </button>
                  )
                })}
              </div>

              <div className="mt-xl">
                <label htmlFor="amount" className="text-sm font-medium text-secondary">
                  Requested amount ({CREDIT_UNIT})
                </label>
                <div className="mt-sm flex items-center rounded-lg border border-primary bg-primary focus-within:ring-2 focus-within:ring-focus-ring">
                  <span className="pl-lg text-sm font-semibold text-tertiary">$</span>
                  <input
                    id="amount"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={reqAmount}
                    onChange={event => setReqAmount(event.target.value)}
                    className="w-full bg-transparent px-md py-lg text-heading-xs font-semibold text-primary outline-none tabular-nums"
                    required
                  />
                  <span className="pr-lg text-xs font-medium text-tertiary">{CREDIT_UNIT}</span>
                </div>
                <div className="mt-sm flex flex-wrap gap-sm">
                  {[5, 15, 25, 40, 100].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReqAmount(String(value))}
                      className={`rounded-full border px-md py-xxs text-xs font-semibold ${
                        reqAmount === String(value)
                          ? 'border-brand bg-utility-brand-50 text-utility-brand-700'
                          : 'border-secondary bg-primary text-tertiary hover:bg-primary-hover'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <p className="mt-sm text-xs text-tertiary">
                  Alice → Bob currently allows <span className="font-semibold text-primary">{fmt(state?.limits.alice_to_bob ?? 10)}</span>;
                  Bob → Alice allows <span className="font-semibold text-primary">{fmt(state?.limits.bob_to_alice ?? 10)}</span>.
                </p>
              </div>

              <div className="mt-xl">
                <label htmlFor="purpose" className="text-sm font-medium text-secondary">
                  Purpose
                </label>
                <textarea
                  id="purpose"
                  rows={2}
                  value={reqPurpose}
                  onChange={event => setReqPurpose(event.target.value)}
                  className="mt-sm w-full rounded-lg border border-primary bg-primary px-lg py-md text-sm text-primary outline-none placeholder:text-placeholder focus:ring-2 focus:ring-focus-ring"
                  placeholder="e.g. settlement buffer for the next delivery"
                />
              </div>

              <div className="mt-xl flex items-start gap-md rounded-xl bg-utility-brand-50 p-md">
                <Brain className="mt-xxs size-5 shrink-0 text-fg-brand-primary" />
                <div>
                  <p className="text-sm font-semibold text-utility-brand-700">
                    {memoryEnabled ? 'History will decide this request' : 'History is bypassed'}
                  </p>
                  <p className="mt-xxs text-xs text-tertiary">
                    {memoryEnabled
                      ? `The server will recall the ${state?.namespace ?? 'credit-demo'} namespace and recompute both limits before answering.`
                      : 'The engine will use only the base limit of 10 and return no evidence.'}
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy === 'evaluate'}
                className="mt-xl inline-flex w-full items-center justify-center gap-sm rounded-lg bg-brand-solid px-lg py-lg text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover disabled:opacity-60"
              >
                {busy === 'evaluate' ? <Spinner label="Recalling from Walrus…" /> : <FileCheck2 className="size-4" />}
                {busy === 'evaluate' ? '' : 'Check the limit'}
              </button>
            </form>
          </section>
        )}

        {tab === 'decision' && (
          <div className="mx-auto max-w-4xl space-y-xl">
            {!decision ? (
              <div className="rounded-2xl border border-dashed border-primary bg-primary p-3xl text-center">
                <FileCheck2 className="mx-auto size-8 text-fg-quaternary" />
                <h2 className="mt-md text-heading-xs font-semibold text-primary">No decision yet</h2>
                <p className="mt-xxs text-sm text-tertiary">Submit a credit request and the evidence will appear here.</p>
                <button
                  type="button"
                  onClick={() => setTab('request')}
                  className="mt-lg inline-flex items-center gap-sm rounded-lg bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand"
                >
                  Request credit <ArrowRight className="size-4" />
                </button>
              </div>
            ) : (
              <>
                <section
                  className={`rounded-2xl border p-2xl shadow-xs ${
                    decision.verdict === 'ALLOW'
                      ? 'border-utility-success-200 bg-utility-success-50'
                      : decision.verdict === 'REDUCE'
                        ? 'border-utility-warning-200 bg-utility-warning-50'
                        : 'border-utility-error-200 bg-utility-error-50'
                  }`}
                >
                  <div className="flex flex-col gap-md sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">Decision report</p>
                      <p className="mt-xxs text-sm font-medium text-secondary">
                        {decision.label} · {decision.purpose}
                      </p>
                      <p
                        className={`mt-md text-heading-2xl font-semibold leading-none tracking-tight ${
                          decision.verdict === 'ALLOW'
                            ? 'text-utility-success-700'
                            : decision.verdict === 'REDUCE'
                              ? 'text-utility-warning-700'
                              : 'text-utility-error-700'
                        }`}
                      >
                        {decision.verdict}
                      </p>
                      <p className="mt-sm max-w-xl text-sm text-secondary">{decision.reason}</p>
                    </div>
                    <div className="flex flex-col items-start gap-sm sm:items-end">
                      <VerdictBadge verdict={decision.verdict} />
                      <Badge tone={decision.source === 'walrus' ? 'success' : 'warning'} dot>
                        {decision.source === 'walrus' ? 'Rebuilt from Walrus' : 'Rebuilt from demo memory'}
                      </Badge>
                      <span className="font-mono text-[11px] text-tertiary">{decision.fingerprint.short}</span>
                    </div>
                  </div>

                  <div className="mt-xl grid grid-cols-2 gap-md border-t border-black/5 pt-xl sm:grid-cols-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-tertiary">Requested</p>
                      <p className="mt-xxs text-lg font-semibold text-primary tabular-nums">{fmtAmount(decision.amount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-tertiary">Reconstructed limit</p>
                      <p className="mt-xxs text-lg font-semibold text-primary tabular-nums">{fmt(decision.limit)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-tertiary">Approved</p>
                      <p className="mt-xxs text-lg font-semibold text-primary tabular-nums">{fmt(decision.approvedAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-tertiary">Memories</p>
                      <p className="mt-xxs text-lg font-semibold text-primary tabular-nums">{decision.memoryCount}</p>
                    </div>
                  </div>
                </section>

                <section className="grid gap-xl md:grid-cols-2">
                  <div className="rounded-2xl border border-secondary bg-primary p-xl">
                    <div className="flex items-center gap-sm">
                      <Brain className="size-4 text-fg-brand-primary" />
                      <h3 className="text-sm font-semibold text-primary">With memory</h3>
                    </div>
                    <p className="mt-md text-heading-xs font-semibold text-primary tabular-nums">
                      {fmt(decision.memoryOn?.limit ?? decision.limit)}
                    </p>
                    <p className="mt-xxs text-xs text-tertiary">
                      {(decision.memoryOn?.recentSuccesses ?? decision.recentSuccesses)} recent successes · +
                      {fmt(decision.memoryOn?.recentBonus ?? decision.recentBonus)} recency bonus
                    </p>
                    <div className="mt-md">
                      <VerdictBadge verdict={decision.memoryOn?.verdict ?? decision.verdict} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-secondary bg-secondary p-xl">
                    <div className="flex items-center gap-sm">
                      <Database className="size-4 text-fg-quaternary" />
                      <h3 className="text-sm font-semibold text-primary">Without memory</h3>
                    </div>
                    <p className="mt-md text-heading-xs font-semibold text-tertiary tabular-nums">{fmt(decision.memoryOff.limit)}</p>
                    <p className="mt-xxs text-xs text-tertiary">Base limit only · no history · no evidence</p>
                    <div className="mt-md">
                      <VerdictBadge verdict={decision.memoryOff.verdict} />
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-secondary bg-primary p-xl shadow-xs">
                  <div className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-sm">
                      <ShieldCheck className="size-4 text-fg-brand-primary" />
                      <h3 className="text-sm font-semibold text-primary">Evidence used</h3>
                    </div>
                    <span className="text-xs text-tertiary">
                      {decision.memoryEnabled
                        ? `${decision.relevant.length} recalled · ${decision.breakdown.length} scored`
                        : 'memory off · base limit applied'}
                    </span>
                  </div>
                  {decision.relevant.length === 0 ? (
                    <div className="mt-md rounded-xl border border-dashed border-primary bg-secondary p-xl text-center text-sm text-tertiary">
                      Memory is off, so there is no evidence trail.
                    </div>
                  ) : (
                    <ul className="mt-md space-y-sm">
                      {decision.relevant
                        .slice()
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                        .map(item => {
                          const scored = decision.breakdown.find(b => b.blobId === item.blobId)
                          return <MemoryRow key={item.id} interaction={item} delta={scored?.delta} compact />
                        })}
                    </ul>
                  )}
                  <div className="mt-lg rounded-xl bg-secondary p-md">
                    {decision.memoryEnabled ? (
                      <p className="font-mono text-[11px] leading-5 text-secondary">
                        limit = 10 + repayments − defaults − drawdowns + recency ={' '}
                        <span className="font-semibold text-primary">{fmt(decision.limit)}</span>
                      </p>
                    ) : (
                      <p className="font-mono text-[11px] leading-5 text-secondary">
                        limit = <span className="font-semibold text-primary">10</span> (memory off · nothing recalled
                        or scored)
                      </p>
                    )}
                  </div>
                </section>

                <section className="grid gap-xl lg:grid-cols-[1fr_1fr]">
                  <div className="rounded-2xl border border-secondary bg-primary p-xl shadow-xs">
                    <div className="flex items-center gap-sm">
                      <FileCheck2 className="size-4 text-fg-brand-primary" />
                      <h3 className="text-sm font-semibold text-primary">Write the outcome</h3>
                    </div>
                    <p className="mt-xs text-xs leading-5 text-tertiary">
                      This writes one new memory, then immediately recomputes the limit. A repayment should lift it; a
                      default should cut it.
                    </p>
                    <input
                      type="text"
                      value={outcomeNote}
                      onChange={event => setOutcomeNote(event.target.value)}
                      placeholder="Optional note (e.g. paid on time)"
                      className="mt-md w-full rounded-lg border border-primary bg-primary px-lg py-sm text-sm text-primary outline-none placeholder:text-placeholder focus:ring-2 focus:ring-focus-ring"
                    />
                    <div className="mt-md grid gap-sm sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => handleRecord('repayment')}
                        disabled={Boolean(busy)}
                        className="inline-flex flex-col items-start gap-xxs rounded-lg border border-utility-success-200 bg-utility-success-50 px-lg py-md text-left hover:bg-utility-success-50/70 disabled:opacity-60"
                      >
                        <span className="inline-flex items-center gap-xs text-xs font-semibold text-utility-success-700">
                          {busy === 'record-repayment' ? <Loader2 className="size-3.5 animate-spin" /> : <TrendingUp className="size-3.5" />}
                          Repayment
                        </span>
                        <span className="text-[10px] text-utility-success-700/70">borrower → lender</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRecord('default')}
                        disabled={Boolean(busy)}
                        className="inline-flex flex-col items-start gap-xxs rounded-lg border border-utility-error-200 bg-utility-error-50 px-lg py-md text-left hover:bg-utility-error-50/70 disabled:opacity-60"
                      >
                        <span className="inline-flex items-center gap-xs text-xs font-semibold text-utility-error-700">
                          {busy === 'record-default' ? <Loader2 className="size-3.5 animate-spin" /> : <TrendingDown className="size-3.5" />}
                          Default
                        </span>
                        <span className="text-[10px] text-utility-error-700/70">borrower → lender</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRecord('advance')}
                        disabled={Boolean(busy)}
                        className="inline-flex flex-col items-start gap-xxs rounded-lg border border-utility-brand-200 bg-utility-brand-50 px-lg py-md text-left hover:bg-utility-brand-50/70 disabled:opacity-60"
                      >
                        <span className="inline-flex items-center gap-xs text-xs font-semibold text-utility-brand-700">
                          {busy === 'record-advance' ? <Loader2 className="size-3.5 animate-spin" /> : <Coins className="size-3.5" />}
                          Advance
                        </span>
                        <span className="text-[10px] text-utility-brand-700/70">lender → borrower</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-secondary bg-primary p-xl shadow-xs">
                    <div className="flex items-center justify-between gap-sm">
                      <div className="flex items-center gap-sm">
                        <Wallet className="size-4 text-fg-brand-primary" />
                        <h3 className="text-sm font-semibold text-primary">Release agent payment</h3>
                      </div>
                      <Badge tone={decision.verdict === 'ALLOW' ? 'success' : 'gray'}>
                        {decision.verdict === 'ALLOW' ? 'Policy open' : 'Locked by policy'}
                      </Badge>
                    </div>
                    <p className="mt-xs text-xs leading-5 text-tertiary">
                      {decision.verdict === 'ALLOW'
                        ? `The reconstructed limit covers the tiny ${status?.payment.amount ?? 0.05} ${status?.payment.symbol ?? 'SUI'} agent transfer. Tatum runs the Sui gateway check.`
                        : 'No agent payment is offered while the request is outside the reconstructed limit.'}
                    </p>

                    {decision.verdict === 'ALLOW' ? (
                      <div className="mt-md space-y-sm">
                        <div className="flex items-center justify-between rounded-lg bg-secondary p-md text-xs">
                          <span className="text-tertiary">Payment</span>
                          <span className="font-semibold text-primary">
                            {status?.payment.amount ?? 0.05} {status?.payment.symbol ?? 'SUI'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-secondary p-md text-xs">
                          <span className="text-tertiary">Agent wallet</span>
                          <span className="font-mono text-primary">
                            {status?.payment.hasKey ? shortAddress(status.payment.balances?.address) : 'not configured'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAuthorizePayment}
                          disabled={busy === 'authorize' || busy === 'execute'}
                          className="inline-flex w-full items-center justify-center gap-sm rounded-lg border border-secondary bg-primary px-lg py-sm text-sm font-semibold text-secondary shadow-xs hover:bg-primary-hover disabled:opacity-60"
                        >
                          {busy === 'authorize' ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                          Authorize with Tatum
                        </button>
                        {paymentAuth && (
                          <div className="rounded-lg border border-secondary bg-secondary p-md text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-tertiary">Authorization</span>
                              <span className="font-semibold text-utility-success-700">
                                {paymentAuth.allowed ? 'ALLOW' : 'BLOCK'}
                              </span>
                            </div>
                            <p className="mt-xxs text-tertiary">{paymentAuth.reason}</p>
                            {paymentAuth.payment?.dryRun && (
                              <p className="mt-xs font-mono text-[11px] text-primary">
                                dry-run: {paymentAuth.payment.dryRun.status}
                              </p>
                            )}
                            {paymentAuth.payment?.mode === 'authorization-only' && (
                              <p className="mt-xs text-[11px] text-utility-warning-700">{paymentAuth.payment.message}</p>
                            )}
                          </div>
                        )}
                        {paymentAuth?.payment?.mode === 'dry-run' && paymentAuth.payment.dryRun?.success && (
                          <button
                            type="button"
                            onClick={handleExecutePayment}
                            disabled={busy === 'execute'}
                            className="inline-flex w-full items-center justify-center gap-sm rounded-lg bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand hover:bg-brand-solid-hover disabled:opacity-60"
                          >
                            {busy === 'execute' ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                            Execute {paymentAuth.paymentAmount} {paymentAuth.symbol}
                          </button>
                        )}
                        {paymentExec && (
                          <div className="rounded-lg border border-utility-success-200 bg-utility-success-50 p-md text-xs">
                            <p className="font-semibold text-utility-success-700">
                              {paymentExec.execution?.success ? 'Payment settled' : 'Payment failed'}
                            </p>
                            {paymentExec.digest && (
                              <div className="mt-xs flex items-center gap-xs">
                                <span className="font-mono text-[10px] text-utility-success-700">{shortBlob(paymentExec.digest)}</span>
                                <CopyButton value={paymentExec.digest} label="Digest" />
                                {paymentExec.explorerUrl && (
                                  <a
                                    href={paymentExec.explorerUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] font-semibold text-utility-success-700 underline"
                                  >
                                    Explorer
                                  </a>
                                )}
                              </div>
                            )}
                            {paymentExec.memoryError && (
                              <p className="mt-xs text-[10px] text-utility-warning-700">Memory write failed: {paymentExec.memoryError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-md flex items-start gap-sm rounded-lg bg-secondary p-md text-xs text-tertiary">
                        <Lock className="mt-xxs size-4 shrink-0" />
                        <span>
                          The button is intentionally absent. A payment only becomes executable when the recalled
                          history reconstructs a limit that covers it.
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                <div className="flex flex-col gap-sm sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setTab('request')}
                    className="inline-flex items-center justify-center gap-sm rounded-lg border border-secondary bg-primary px-lg py-sm text-sm font-semibold text-secondary hover:bg-primary-hover"
                  >
                    New request
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('history')}
                    className="inline-flex items-center justify-center gap-sm rounded-lg bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand hover:bg-brand-solid-hover"
                  >
                    Open memory ledger <ArrowRight className="size-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <section className="space-y-xl">
            <SectionHeading
              eyebrow="Shared namespace"
              title="Memory ledger"
              action={
                <div className="flex flex-wrap items-center gap-sm">
                  <Badge tone={isWalrus ? 'success' : 'warning'} dot>
                    {isWalrus ? 'Walrus Memory' : 'Demo memory'}
                  </Badge>
                  <span className="font-mono text-[11px] text-tertiary">{history?.fingerprint.short ?? state?.fingerprint.short}</span>
                </div>
              }
            />

            <div className="flex flex-wrap gap-sm">
              {[
                ['all', 'All'],
                ['repayment', 'Repayments'],
                ['default', 'Defaults'],
                ['advance', 'Advances'],
                ['fulfillment', 'Fulfillments'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleFilter(value)}
                  disabled={busy === 'history'}
                  className={`rounded-full border px-lg py-xs text-xs font-semibold transition-colors ${
                    historyFilter === value
                      ? 'border-brand bg-utility-brand-50 text-utility-brand-700'
                      : 'border-secondary bg-primary text-tertiary hover:bg-primary-hover'
                  }`}
                >
                  {label}
                  <span className="ml-xs text-[10px] opacity-70">
                    {value === 'all' ? history?.namespaceTotal ?? 0 : history?.counts[value] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xs">
              <div className="flex flex-col gap-sm border-b border-secondary p-xl sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {history?.total ?? 0} {historyFilter === 'all' ? 'memories' : `${historyFilter} memories`}
                  </p>
                  <p className="mt-xxs text-xs text-tertiary">
                    Re-read from {state?.relayer} · namespace {state?.namespace}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => refreshAll(historyFilter)}
                  disabled={busy === 'state'}
                  className="inline-flex items-center gap-sm rounded-lg border border-secondary bg-primary px-lg py-sm text-xs font-semibold text-secondary hover:bg-primary-hover disabled:opacity-60"
                >
                  {busy === 'state' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Re-read from Walrus
                </button>
              </div>

              {!history || history.interactions.length === 0 ? (
                <div className="p-3xl text-center">
                  <Database className="mx-auto size-8 text-fg-quaternary" />
                  <p className="mt-md text-sm font-semibold text-primary">No memories in this filter</p>
                  <p className="mt-xxs text-xs text-tertiary">Write an outcome from a decision, or seed the demo set.</p>
                  <button
                    type="button"
                    onClick={handleSeed}
                    disabled={busy === 'seed'}
                    className="mt-lg inline-flex items-center gap-sm rounded-lg bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand disabled:opacity-60"
                  >
                    {busy === 'seed' ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
                    Seed 15 memories
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-secondary">
                      <tr className="border-b border-secondary text-left">
                        <th className="px-xl py-md text-[11px] font-semibold uppercase tracking-wide text-quaternary">Memory</th>
                        <th className="px-xl py-md text-[11px] font-semibold uppercase tracking-wide text-quaternary">Flow</th>
                        <th className="px-xl py-md text-[11px] font-semibold uppercase tracking-wide text-quaternary">Amount</th>
                        <th className="px-xl py-md text-[11px] font-semibold uppercase tracking-wide text-quaternary">Result</th>
                        <th className="px-xl py-md text-[11px] font-semibold uppercase tracking-wide text-quaternary">Blob</th>
                        <th className="px-xl py-md text-[11px] font-semibold uppercase tracking-wide text-quaternary">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.interactions
                        .slice()
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                        .map(item => (
                          <tr key={item.id} className="border-b border-secondary last:border-0 hover:bg-secondary-hover">
                            <td className="px-xl py-lg">
                              <div className="flex items-center gap-sm">
                                <span
                                  className={`flex size-7 items-center justify-center rounded-full border ${
                                    item.type === 'repayment'
                                      ? 'border-utility-success-200 bg-utility-success-50 text-utility-success-700'
                                      : item.type === 'default'
                                        ? 'border-utility-error-200 bg-utility-error-50 text-utility-error-700'
                                        : item.type === 'advance'
                                          ? 'border-utility-brand-200 bg-utility-brand-50 text-utility-brand-700'
                                          : 'border-utility-gray-200 bg-utility-gray-50 text-utility-gray-700'
                                  }`}
                                >
                                  {typeIcon(item.type)}
                                </span>
                                <div>
                                  <p className="text-xs font-semibold capitalize text-primary">{item.type}</p>
                                  <p className="max-w-[260px] truncate text-[11px] text-tertiary">{item.note || item.text}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-xl py-lg text-xs text-secondary">
                              {item.from} → {item.to}
                            </td>
                            <td className="px-xl py-lg text-xs font-semibold text-primary tabular-nums">{fmtAmount(item.amount)}</td>
                            <td className="px-xl py-lg">
                              <Badge tone={item.result === 'success' ? 'success' : item.result === 'failed' ? 'error' : 'warning'}>
                                {item.result}
                              </Badge>
                            </td>
                            <td className="px-xl py-lg">
                              <div className="flex items-center gap-xs">
                                <span className="font-mono text-[10px] text-tertiary" title={item.blobId ?? undefined}>
                                  {shortBlob(item.blobId)}
                                </span>
                                {item.blobId && <CopyButton value={item.blobId} label="Blob" />}
                              </div>
                            </td>
                            <td className="px-xl py-lg text-[11px] text-tertiary">{fmtDate(item.timestamp)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-sm rounded-xl border border-secondary bg-primary p-lg text-xs text-tertiary sm:flex-row sm:items-center sm:justify-between">
              <span>
                Full memory text is stored in the blob. The dashboard parses tags from the recalled sentence; it never
                keeps a local copy.
              </span>
              <span className="font-mono text-[10px]">{history?.fingerprint.full ?? state?.fingerprint.full}</span>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-secondary bg-primary">
        <div className="mx-auto flex max-w-6xl flex-col gap-sm px-xl py-xl text-xs text-tertiary sm:flex-row sm:items-center sm:justify-between">
          <span>Total Recall · bilateral credit on Walrus Memory + Sui</span>
          <span className="font-mono text-[10px]">
            {state?.namespace ?? 'credit-demo'} ·{' '}
            {state?.mode === 'live'
              ? state.relayer?.includes('dev.memwal.ai')
                ? 'testnet relayer'
                : 'mainnet relayer'
              : 'mock'}{' '}
            · base limit 10
          </span>
        </div>
      </footer>
    </div>
  )
}

export default App
