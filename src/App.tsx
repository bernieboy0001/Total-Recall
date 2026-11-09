import React, { useState } from 'react'
import {
  Brain,
  ArrowRightLeft,
  FileCheck2,
  History,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Coins,
  ShieldCheck,
  TrendingDown,
  RotateCcw
} from 'lucide-react'

type TabType = 'dashboard' | 'request' | 'decision' | 'history'

interface HistoryEntry {
  id: string
  timestamp: string
  type: 'request' | 'repayment' | 'default'
  direction: 'alice_to_bob' | 'bob_to_alice'
  amount: number
  purpose?: string
  status: 'ALLOW' | 'REDUCE' | 'BLOCK' | 'RECORDED'
  evidence: string[]
  memoryActive: boolean
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(true)

  // Credit limits (client-side state)
  const [aliceToBobLimit, setAliceToBobLimit] = useState<number>(5000)
  const [bobToAliceLimit, setBobToAliceLimit] = useState<number>(3500)

  // Request form state
  const [reqDirection, setReqDirection] = useState<'alice_to_bob' | 'bob_to_alice'>('alice_to_bob')
  const [reqAmount, setReqAmount] = useState<string>('1200')
  const [reqPurpose, setReqPurpose] = useState<string>('Liquidity supply for trade settlement')

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      id: 'tx-1',
      timestamp: 'Today, 10:15 AM',
      type: 'request',
      direction: 'alice_to_bob',
      amount: 1200,
      purpose: 'Trade liquidity buffer',
      status: 'ALLOW',
      evidence: [
        'Requested amount ($1,200) within available credit limit ($5,000)',
        'Historical repayment rate is 100% across previous settlement cycles',
        'Memory state active: Alice has zero recorded defaults against Bob'
      ],
      memoryActive: true
    },
    {
      id: 'tx-2',
      timestamp: 'Yesterday, 3:45 PM',
      type: 'repayment',
      direction: 'bob_to_alice',
      amount: 500,
      purpose: 'Repayment of invoice settlement #402',
      status: 'RECORDED',
      evidence: [
        'Repayment confirmed on ledger log',
        'Positive reputation score incremented for Bob'
      ],
      memoryActive: true
    }
  ])

  // Latest decision state
  const [latestDecision, setLatestDecision] = useState<{
    direction: 'alice_to_bob' | 'bob_to_alice'
    amount: number
    purpose: string
    verdict: 'ALLOW' | 'REDUCE' | 'BLOCK'
    calculatedLimit: number
    evidence: string[]
    memoryActive: boolean
  }>({
    direction: 'alice_to_bob',
    amount: 1200,
    purpose: 'Liquidity supply for trade settlement',
    verdict: 'ALLOW',
    calculatedLimit: 5000,
    evidence: [
      'Credit line status: Active bilateral trust agreement',
      'Memory enabled: Historical party behavior and defaults evaluated',
      'Utilization score: Within approved safety threshold (24% of maximum pool)'
    ],
    memoryActive: true
  })

  // Submit request logic
  const handleEvaluateRequest = (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = parseFloat(reqAmount) || 0
    const availableLimit = reqDirection === 'alice_to_bob' ? aliceToBobLimit : bobToAliceLimit

    let verdict: 'ALLOW' | 'REDUCE' | 'BLOCK' = 'ALLOW'
    let calculatedLimit = availableLimit
    const evidence: string[] = []

    if (memoryEnabled) {
      evidence.push('Adaptive Memory Engine: ENABLED (prior transaction patterns factored into risk rating)')
    } else {
      evidence.push('Adaptive Memory Engine: DISABLED (stateless evaluation based purely on static cap)')
    }

    if (amountNum <= 0) {
      verdict = 'BLOCK'
      evidence.push('Invalid credit request amount provided')
    } else if (amountNum <= availableLimit) {
      verdict = 'ALLOW'
      evidence.push(`Requested sum ($${amountNum.toLocaleString()}) is fully covered by current ceiling ($${availableLimit.toLocaleString()})`)
      if (memoryEnabled) {
        evidence.push('Zero delinquent events registered between parties in memory ledger')
        evidence.push('Counterparty exposure ratio is healthy (<60%)')
      }
    } else if (amountNum <= availableLimit * 1.5 && memoryEnabled) {
      verdict = 'REDUCE'
      calculatedLimit = availableLimit
      evidence.push(`Requested sum ($${amountNum.toLocaleString()}) exceeds base limit ($${availableLimit.toLocaleString()})`)
      evidence.push(`Memory risk protocol permits conditional reduction to safety ceiling: $${calculatedLimit.toLocaleString()}`)
    } else {
      verdict = 'BLOCK'
      calculatedLimit = availableLimit
      evidence.push(`Requested sum ($${amountNum.toLocaleString()}) critically exceeds limit ($${availableLimit.toLocaleString()})`)
      evidence.push('Exceeds allowable unilateral exposure margin')
    }

    const newDecision = {
      direction: reqDirection,
      amount: amountNum,
      purpose: reqPurpose || 'Unspecified credit transfer',
      verdict,
      calculatedLimit,
      evidence,
      memoryActive: memoryEnabled
    }

    setLatestDecision(newDecision)

    const newEntry: HistoryEntry = {
      id: `tx-${Date.now()}`,
      timestamp: 'Just now',
      type: 'request',
      direction: reqDirection,
      amount: amountNum,
      purpose: reqPurpose || 'Unspecified credit transfer',
      status: verdict,
      evidence,
      memoryActive: memoryEnabled
    }

    setHistory(prev => [newEntry, ...prev])
    setActiveTab('decision')
  }

  const handleRecordRepayment = (direction: 'alice_to_bob' | 'bob_to_alice') => {
    const repayAmount = 500
    if (direction === 'alice_to_bob') {
      setAliceToBobLimit(prev => prev + repayAmount)
    } else {
      setBobToAliceLimit(prev => prev + repayAmount)
    }

    const entry: HistoryEntry = {
      id: `tx-${Date.now()}`,
      timestamp: 'Just now',
      type: 'repayment',
      direction,
      amount: repayAmount,
      purpose: 'Simulated credit line repayment',
      status: 'RECORDED',
      evidence: [
        `Repayment of $${repayAmount} received and logged`,
        `Available credit ceiling expanded by +$${repayAmount}`
      ],
      memoryActive: memoryEnabled
    }
    setHistory(prev => [entry, ...prev])
  }

  const handleRecordDefault = (direction: 'alice_to_bob' | 'bob_to_alice') => {
    const penalty = 1000
    if (direction === 'alice_to_bob') {
      setAliceToBobLimit(prev => Math.max(0, prev - penalty))
    } else {
      setBobToAliceLimit(prev => Math.max(0, prev - penalty))
    }

    const entry: HistoryEntry = {
      id: `tx-${Date.now()}`,
      timestamp: 'Just now',
      type: 'default',
      direction,
      amount: penalty,
      purpose: 'Simulated counterparty default flag',
      status: 'BLOCK',
      evidence: [
        'Default recorded in counterparty ledger profile',
        `Credit capacity slashed by -$${penalty} to mitigate bad debt risk`,
        memoryEnabled ? 'Memory module tagged counterparty with elevated default probability' : 'Stateless mode: limit decremented without reputation penalty'
      ],
      memoryActive: memoryEnabled
    }
    setHistory(prev => [entry, ...prev])
  }

  return (
    <div className="min-h-screen bg-secondary text-primary font-sans antialiased flex flex-col">
      {/* Top Header */}
      <header className="border-b border-secondary bg-primary px-xl py-lg sticky top-0 z-10 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
          <div className="flex items-center gap-md">
            {/* Featured Icon component recipe */}
            <span className="flex size-10 items-center justify-center rounded-full bg-utility-brand-50 shrink-0">
              <ArrowRightLeft className="size-5 shrink-0 text-utility-brand-600" />
            </span>
            <div>
              <h1 className="text-heading-xs font-semibold text-primary">Bilateral Credit Dashboard</h1>
              <p className="text-xs text-secondary">Peer-to-peer credit risk & memory limits for Alice & Bob</p>
            </div>
          </div>

          {/* Prominent Memory Switch Container */}
          <div className="flex items-center gap-lg bg-secondary border border-secondary px-xl py-sm rounded-lg shadow-xs">
            <div className="flex items-center gap-xs">
              <Brain className={`size-5 shrink-0 ${memoryEnabled ? 'text-fg-brand-primary' : 'text-fg-quaternary'}`} />
              <div className="text-left">
                <span className="text-xs font-semibold block text-primary">
                  Adaptive Memory
                </span>
                <span className="text-xs block text-secondary">
                  {memoryEnabled ? 'Stateful memory ON' : 'Stateless evaluation OFF'}
                </span>
              </div>
            </div>

            {/* Switch component recipe */}
            <button
              type="button"
              onClick={() => setMemoryEnabled(!memoryEnabled)}
              className={`flex h-5 w-9 items-center rounded-full p-xxs transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
                memoryEnabled ? 'bg-brand-solid' : 'bg-tertiary'
              }`}
              role="switch"
              aria-checked={memoryEnabled}
            >
              <span
                className={`size-4 rounded-full bg-primary shadow-xs transition-transform duration-200 ease-in-out ${
                  memoryEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs component recipe: baseline border-secondary, selected text-brand-primary + border-brand */}
      <div className="border-b border-secondary bg-primary">
        <div className="max-w-6xl mx-auto px-xl flex gap-lg overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-xs ${
              activeTab === 'dashboard'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring'
            }`}
          >
            <Coins className="size-4 shrink-0" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('request')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-xs ${
              activeTab === 'request'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring'
            }`}
          >
            <ArrowRightLeft className="size-4 shrink-0" />
            Request Credit
          </button>
          <button
            onClick={() => setActiveTab('decision')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-xs ${
              activeTab === 'decision'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring'
            }`}
          >
            <FileCheck2 className="size-4 shrink-0" />
            Decision Engine
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-xs ${
              activeTab === 'history'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring'
            }`}
          >
            <History className="size-4 shrink-0" />
            Audit History
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-xl py-2xl flex-1">
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-2xl">
            {/* Alert component recipe: tinted callout */}
            <div className={`flex gap-lg rounded-xl p-xl ${
              memoryEnabled ? 'bg-utility-brand-50' : 'bg-utility-gray-50'
            }`}>
              <Brain className={`mt-xxs size-5 shrink-0 ${
                memoryEnabled ? 'text-utility-brand-600' : 'text-utility-gray-600'
              }`} />
              <div>
                <p className={`text-sm font-semibold ${
                  memoryEnabled ? 'text-utility-brand-600' : 'text-utility-gray-600'
                }`}>
                  Memory Mode: {memoryEnabled ? 'Active (Historical Risk Context Enforced)' : 'Inactive (Stateless Mode)'}
                </p>
                <p className="mt-xxs text-sm text-tertiary">
                  {memoryEnabled
                    ? 'Credit decisions incorporate previous borrower repayments, defaults, and exposure track records to adjust limits dynamically.'
                    : 'System evaluates only current hardcoded limit thresholds without memory tracking or reputation weights.'}
                </p>
              </div>
            </div>

            {/* Bilateral Cards Grid using Card recipe (rounded-xl border border-secondary bg-primary p-xl shadow-xs) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
              {/* Alice -> Bob Card */}
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-md border-b border-secondary">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Direction</p>
                      <h2 className="text-heading-xs font-semibold text-primary">Alice → Bob</h2>
                    </div>
                    {/* Badge recipe */}
                    <span className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
                      Active Facility
                    </span>
                  </div>

                  <div className="py-xl">
                    <p className="text-sm text-tertiary">Available Credit Limit</p>
                    <p className="mt-md text-heading-lg font-semibold text-primary">
                      ${aliceToBobLimit.toLocaleString()}
                    </p>
                    <p className="text-xs text-tertiary mt-xs">
                      Alice guarantees credit line to Bob up to this cap.
                    </p>
                  </div>
                </div>

                <div className="pt-md border-t border-secondary space-y-sm">
                  <p className="text-xs font-medium text-secondary">Simulate Bilateral Events</p>
                  <div className="grid grid-cols-2 gap-sm">
                    {/* Button secondary recipe */}
                    <button
                      type="button"
                      onClick={() => handleRecordRepayment('alice_to_bob')}
                      className="inline-flex items-center justify-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <RotateCcw className="size-4 text-fg-success-primary shrink-0" />
                      Record repayment
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRecordDefault('alice_to_bob')}
                      className="inline-flex items-center justify-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <TrendingDown className="size-4 text-fg-error-primary shrink-0" />
                      Record default
                    </button>
                  </div>
                </div>
              </section>

              {/* Bob -> Alice Card */}
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-md border-b border-secondary">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Direction</p>
                      <h2 className="text-heading-xs font-semibold text-primary">Bob → Alice</h2>
                    </div>
                    {/* Badge recipe */}
                    <span className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
                      Active Facility
                    </span>
                  </div>

                  <div className="py-xl">
                    <p className="text-sm text-tertiary">Available Credit Limit</p>
                    <p className="mt-md text-heading-lg font-semibold text-primary">
                      ${bobToAliceLimit.toLocaleString()}
                    </p>
                    <p className="text-xs text-tertiary mt-xs">
                      Bob guarantees credit line to Alice up to this cap.
                    </p>
                  </div>
                </div>

                <div className="pt-md border-t border-secondary space-y-sm">
                  <p className="text-xs font-medium text-secondary">Simulate Bilateral Events</p>
                  <div className="grid grid-cols-2 gap-sm">
                    {/* Button secondary recipe */}
                    <button
                      type="button"
                      onClick={() => handleRecordRepayment('bob_to_alice')}
                      className="inline-flex items-center justify-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <RotateCcw className="size-4 text-fg-success-primary shrink-0" />
                      Record repayment
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRecordDefault('bob_to_alice')}
                      className="inline-flex items-center justify-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <TrendingDown className="size-4 text-fg-error-primary shrink-0" />
                      Record default
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* Quick Actions Card */}
            <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-md">
              <div>
                <p className="text-sm font-semibold text-primary">Ready to evaluate a new transaction?</p>
                <p className="mt-xxs text-sm text-tertiary">Submit a proposed credit draw and test the decision engine rules.</p>
              </div>
              {/* Button primary recipe */}
              <button
                onClick={() => setActiveTab('request')}
                className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Create Request
                <ArrowRightLeft className="size-4 text-fg-white shrink-0" />
              </button>
            </section>
          </div>
        )}

        {/* TAB 2: REQUEST FORM */}
        {activeTab === 'request' && (
          <section className="max-w-2xl mx-auto rounded-xl border border-secondary bg-primary p-2xl shadow-xs">
            <div className="mb-xl pb-md border-b border-secondary">
              <h2 className="text-heading-xs font-semibold text-primary">Submit Credit Request</h2>
              <p className="text-xs text-secondary mt-xxs">
                Initiate a credit draw between parties. The decision engine will compute eligibility based on current limits and memory mode.
              </p>
            </div>

            <form onSubmit={handleEvaluateRequest} className="space-y-xl">
              {/* Radio Group recipe */}
              <div className="flex flex-col gap-sm">
                <span className="text-sm font-medium text-secondary">Credit Direction</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                  <label
                    onClick={() => setReqDirection('alice_to_bob')}
                    className={`flex items-center gap-sm p-md rounded-lg border cursor-pointer transition-colors ${
                      reqDirection === 'alice_to_bob'
                        ? 'border-brand bg-utility-brand-50'
                        : 'border-primary bg-primary hover:bg-primary-hover'
                    }`}
                  >
                    <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                      reqDirection === 'alice_to_bob' ? 'border-brand bg-primary' : 'border-primary bg-primary'
                    }`}>
                      {reqDirection === 'alice_to_bob' && (
                        <span className="size-2 rounded-full bg-brand-solid" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-secondary block">Alice → Bob</span>
                      <span className="text-xs text-tertiary block">Limit: ${aliceToBobLimit.toLocaleString()}</span>
                    </div>
                  </label>

                  <label
                    onClick={() => setReqDirection('bob_to_alice')}
                    className={`flex items-center gap-sm p-md rounded-lg border cursor-pointer transition-colors ${
                      reqDirection === 'bob_to_alice'
                        ? 'border-brand bg-utility-brand-50'
                        : 'border-primary bg-primary hover:bg-primary-hover'
                    }`}
                  >
                    <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                      reqDirection === 'bob_to_alice' ? 'border-brand bg-primary' : 'border-primary bg-primary'
                    }`}>
                      {reqDirection === 'bob_to_alice' && (
                        <span className="size-2 rounded-full bg-brand-solid" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-secondary block">Bob → Alice</span>
                      <span className="text-xs text-tertiary block">Limit: ${bobToAliceLimit.toLocaleString()}</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Input & Field recipe: label, control, hint */}
              <div className="flex flex-col gap-sm">
                <label htmlFor="req-amount" className="text-sm font-medium text-secondary">
                  Requested Amount ($)
                </label>
                <div className="relative">
                  <input
                    id="req-amount"
                    type="number"
                    min="1"
                    step="1"
                    value={reqAmount}
                    onChange={(e) => setReqAmount(e.target.value)}
                    required
                    placeholder="e.g. 1200"
                    className="w-full rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                  />
                </div>
                <p className="text-xs text-tertiary">Maximum single bilateral draw allowed by protocol rules.</p>
              </div>

              {/* Textarea Field */}
              <div className="flex flex-col gap-sm">
                <label htmlFor="req-purpose" className="text-sm font-medium text-secondary">
                  Purpose of Credit
                </label>
                <textarea
                  id="req-purpose"
                  rows={3}
                  value={reqPurpose}
                  onChange={(e) => setReqPurpose(e.target.value)}
                  placeholder="e.g. Liquidity bridge, inventory pre-funding, cross-party hedge"
                  className="w-full rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                />
                <p className="text-xs text-tertiary">Evidence logging requirement for bilateral transparency.</p>
              </div>

              {/* Status Notice */}
              <div className="flex gap-md rounded-xl bg-utility-brand-50 p-md items-center">
                <Brain className="size-5 shrink-0 text-utility-brand-600" />
                <div>
                  <p className="text-sm font-semibold text-utility-brand-600">
                    Memory Status: {memoryEnabled ? 'Enabled' : 'Bypassed'}
                  </p>
                  <p className="text-xs text-tertiary">
                    {memoryEnabled ? 'Historical defaults and repayments will influence final verdict.' : 'Decisions will only evaluate available credit ceiling.'}
                  </p>
                </div>
              </div>

              {/* Submit Button (primary) */}
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <FileCheck2 className="size-4 text-fg-white shrink-0" />
                Run Decision Engine
              </button>
            </form>
          </section>
        )}

        {/* TAB 3: DECISION PAGE */}
        {activeTab === 'decision' && (
          <div className="max-w-3xl mx-auto space-y-xl">
            {/* Verdict Card */}
            <section className="rounded-xl border border-secondary bg-primary p-2xl shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-lg border-b border-secondary gap-md">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                    Credit Decision Report
                  </p>
                  <h2 className="text-heading-sm font-semibold text-primary mt-xxs">
                    {latestDecision.direction === 'alice_to_bob' ? 'Alice → Bob' : 'Bob → Alice'} Transaction
                  </h2>
                </div>

                {/* Badge component recipes */}
                <div>
                  {latestDecision.verdict === 'ALLOW' && (
                    <span className="inline-flex items-center gap-xs rounded-full border border-utility-success-200 bg-utility-success-50 px-md py-xxs text-xs font-medium text-utility-success-700">
                      <CheckCircle2 className="size-4 text-fg-success-primary shrink-0" />
                      ALLOW
                    </span>
                  )}
                  {latestDecision.verdict === 'REDUCE' && (
                    <span className="inline-flex items-center gap-xs rounded-full border border-utility-warning-200 bg-utility-warning-50 px-md py-xxs text-xs font-medium text-utility-warning-700">
                      <AlertTriangle className="size-4 text-fg-warning-primary shrink-0" />
                      REDUCE
                    </span>
                  )}
                  {latestDecision.verdict === 'BLOCK' && (
                    <span className="inline-flex items-center gap-xs rounded-full border border-utility-error-200 bg-utility-error-50 px-md py-xxs text-xs font-medium text-utility-error-700">
                      <XCircle className="size-4 text-fg-error-primary shrink-0" />
                      BLOCK
                    </span>
                  )}
                </div>
              </div>

              {/* Decision Metrics Group */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-md py-xl border-b border-secondary">
                <div className="bg-secondary p-md rounded-lg border border-secondary">
                  <p className="text-sm text-tertiary">Requested</p>
                  <p className="mt-xs text-heading-xs font-semibold text-primary">
                    ${latestDecision.amount.toLocaleString()}
                  </p>
                </div>
                <div className="bg-secondary p-md rounded-lg border border-secondary">
                  <p className="text-sm text-tertiary">Calculated Limit</p>
                  <p className="mt-xs text-heading-xs font-semibold text-primary">
                    ${latestDecision.calculatedLimit.toLocaleString()}
                  </p>
                </div>
                <div className="bg-secondary p-md rounded-lg border border-secondary">
                  <p className="text-sm text-tertiary">Memory Engine</p>
                  <p className="mt-xs text-sm font-semibold text-primary">
                    {latestDecision.memoryActive ? 'Active Factor' : 'Bypassed'}
                  </p>
                </div>
              </div>

              {/* Purpose display */}
              <div className="py-md border-b border-secondary">
                <p className="text-xs font-medium text-secondary">Stated Purpose</p>
                <p className="text-sm text-primary mt-xxs">{latestDecision.purpose}</p>
              </div>

              {/* Evidence Section */}
              <div className="pt-xl">
                <div className="flex items-center gap-xs mb-md">
                  <ShieldCheck className="size-4 text-fg-brand-primary shrink-0" />
                  <h3 className="text-sm font-semibold text-primary">Rules & Evidence Trail</h3>
                </div>

                <ul className="space-y-sm">
                  {latestDecision.evidence.map((item, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-sm p-sm rounded-lg bg-secondary border border-secondary text-xs text-secondary"
                    >
                      <span className="flex size-5 items-center justify-center rounded-full bg-utility-brand-50 border border-utility-brand-200 text-utility-brand-700 font-bold text-xs shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Decision Action Links */}
              <div className="mt-xl pt-lg border-t border-secondary flex items-center justify-end gap-md">
                <button
                  type="button"
                  onClick={() => setActiveTab('request')}
                  className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  New Request
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  View All History
                </button>
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: TABLE (using Table recipe: rounded-xl border border-secondary bg-primary) */}
        {activeTab === 'history' && (
          <div className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs">
            <div className="p-xl border-b border-secondary flex items-center justify-between">
              <div>
                <h2 className="text-heading-xs font-semibold text-primary">Transaction & Audit History</h2>
                <p className="text-xs text-secondary mt-xxs">Chronological log of credit requests, repayments, and defaults</p>
              </div>
              <span className="inline-flex items-center gap-xs rounded-full border border-utility-gray-200 bg-utility-gray-50 px-md py-xxs text-xs font-medium text-utility-gray-700">
                {history.length} records
              </span>
            </div>

            {history.length === 0 ? (
              <div className="py-2xl text-center text-secondary text-sm">
                No activity records recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-secondary">
                    <tr className="border-b border-secondary text-left">
                      <th className="px-xl py-md text-sm font-semibold text-quaternary">Party & Details</th>
                      <th className="px-xl py-md text-sm font-semibold text-quaternary">Timestamp</th>
                      <th className="px-xl py-md text-sm font-semibold text-quaternary">Type</th>
                      <th className="px-xl py-md text-sm font-semibold text-quaternary">Amount</th>
                      <th className="px-xl py-md text-sm font-semibold text-quaternary text-right">Verdict / Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id} className="border-b border-secondary hover:bg-secondary-hover transition-colors">
                        <td className="px-xl py-lg text-sm">
                          <p className="font-semibold text-primary">
                            {item.direction === 'alice_to_bob' ? 'Alice → Bob' : 'Bob → Alice'}
                          </p>
                          <p className="text-xs text-tertiary mt-xxs">{item.purpose || 'Credit operation'}</p>
                        </td>
                        <td className="px-xl py-lg text-sm text-tertiary">
                          {item.timestamp}
                        </td>
                        <td className="px-xl py-lg text-sm text-tertiary uppercase font-mono text-xs">
                          {item.type}
                        </td>
                        <td className="px-xl py-lg text-sm font-semibold text-primary">
                          ${item.amount.toLocaleString()}
                        </td>
                        <td className="px-xl py-lg text-right">
                          {item.status === 'ALLOW' && (
                            <span className="inline-flex items-center gap-xs rounded-full border border-utility-success-200 bg-utility-success-50 px-md py-xxs text-xs font-medium text-utility-success-700">
                              ALLOW
                            </span>
                          )}
                          {item.status === 'REDUCE' && (
                            <span className="inline-flex items-center gap-xs rounded-full border border-utility-warning-200 bg-utility-warning-50 px-md py-xxs text-xs font-medium text-utility-warning-700">
                              REDUCE
                            </span>
                          )}
                          {item.status === 'BLOCK' && (
                            <span className="inline-flex items-center gap-xs rounded-full border border-utility-error-200 bg-utility-error-50 px-md py-xxs text-xs font-medium text-utility-error-700">
                              BLOCK
                            </span>
                          )}
                          {item.status === 'RECORDED' && (
                            <span className="inline-flex items-center gap-xs rounded-full border border-utility-gray-200 bg-utility-gray-50 px-md py-xxs text-xs font-medium text-utility-gray-700">
                              RECORDED
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
