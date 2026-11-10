export type Party = 'alice' | 'bob' | 'agent'
export type InteractionType = 'repayment' | 'default' | 'advance' | 'fulfillment' | 'request'
export type InteractionResult = 'success' | 'failed' | 'pending'
export type Direction = 'alice_to_bob' | 'bob_to_alice'
export type Verdict = 'ALLOW' | 'REDUCE' | 'BLOCK'

export interface Interaction {
  id: string
  blobId: string | null
  text: string
  type: InteractionType
  from: Party
  to: Party
  amount: number
  result: InteractionResult
  timestamp: string
  note: string
  distance?: number
}

export interface BreakdownItem {
  interactionId: string
  blobId: string | null
  rule: string
  delta: number
  amount: number
  type: InteractionType
  result: InteractionResult
  timestamp: string
  from: Party
  to: Party
  note: string
}

export interface DirectionState {
  limit: number
  rawLimit: number
  breakdown: BreakdownItem[]
  recentSuccesses: number
  recentBonus: number
  formula: Record<string, string | number>
}

export interface MemoryStatus {
  mode: 'live' | 'mock'
  configured: boolean
  namespace: string
  relayer: string
  accountId: string | null
  recallLimit: number
  health: Record<string, unknown>
  source: 'walrus' | 'mock'
  liveHint: string
}

export interface CreditState extends MemoryStatus {
  memoryEnabled: boolean
  memoryCount: number
  recallTotal: number
  recallLimit: number
  truncated: boolean
  recallErrors: Array<{ query: string; message: string }>
  limits: { alice_to_bob: number; bob_to_alice: number }
  directions: { alice_to_bob: DirectionState; bob_to_alice: DirectionState }
  evidence: Interaction[]
  lastUpdated: string
  fingerprint: { short: string; full: string }
  baseLimit: number
}

export interface Decision {
  direction: Direction
  label: string
  lender: Party
  borrower: Party
  amount: number
  purpose: string
  memoryEnabled: boolean
  verdict: Verdict
  approvedAmount: number
  reason: string
  limit: number
  rawLimit: number
  breakdown: BreakdownItem[]
  relevant: Interaction[]
  recentSuccesses: number
  recentBonus: number
  memoryOff: { limit: number; verdict: Verdict; approvedAmount: number }
  memoryOn: {
    limit: number
    verdict: Verdict
    approvedAmount: number
    recentSuccesses: number
    recentBonus: number
  }
  formula: Record<string, string | number>
  evaluatedAt: string
  memoryCount: number
  memoryMode: 'live' | 'mock'
  source: 'walrus' | 'mock'
  namespace: string
  state: { limits: { alice_to_bob: number; bob_to_alice: number }; memoryCount: number }
  fingerprint: { short: string; full: string }
}

export interface HistoryResponse {
  interactions: Interaction[]
  total: number
  namespaceTotal: number
  counts: Record<string, number>
  filter: string
  truncated: boolean
  mode: 'live' | 'mock'
  namespace: string
  fingerprint: { short: string; full: string }
  lastUpdated: string
}

export interface AppStatus {
  memory: MemoryStatus
  tatum: { status: string; error?: string }
  payment: {
    enabled: boolean
    configured: boolean
    hasKey: boolean
    tatumConfigured: boolean
    symbol: string
    coinType: string
    decimals: number
    amount: number
    recipient: string | null
    network: string
    balances: {
      configured: boolean
      address: string | null
      symbol: string
      balances: { sui: string; token: string; tokenSymbol: string } | null
      reason?: string
      error?: string
    } | null
  }
}

export interface PaymentAuthorization {
  allowed: boolean
  reason: string
  direction: Direction
  label: string
  lender: Party
  borrower: Party
  requestedAmount: number
  paymentAmount: number
  symbol: string
  coinType: string
  network: string
  limit: number
  memoryCount: number
  decision: { verdict: Verdict; approvedAmount: number; reason: string }
  payment: {
    mode: 'authorization-only' | 'dry-run'
    configured: boolean
    message?: string
    sender?: string
    recipient?: string
    amount?: number
    symbol?: string
    coinType?: string
    network?: string
    gasBudgetMist?: string
    dryRun?: {
      status: string
      success: boolean
      error: unknown
      gasUsed: unknown
      effects: unknown
    }
  } | null
  error?: string
}

export interface PaymentExecution {
  allowed: boolean
  digest?: string
  explorerUrl?: string
  sender?: string
  recipient?: string
  amount?: number
  symbol?: string
  execution?: { status: string; success: boolean; error: unknown }
  memory?: { blobId: string; text: string }
  memoryError?: string
  limitBefore?: number
  limitAfter?: number
  memoryCount?: number
  error?: string
}

export type AgentRail = 'none' | 'dry-run' | 'execute'

export interface AgentResponse {
  agent: true
  direction: Direction
  label: string
  lender: Party
  borrower: Party
  requestedAmount: number
  purpose: string
  paymentAmount: number
  maxRelease: number
  symbol: string
  network: string
  rail: AgentRail
  verdict: Verdict
  reason: string
  limit: number
  autoApproved: boolean
  released: boolean
  decision: Partial<Decision>
  payment: {
    mode: 'authorization-only' | 'dry-run' | 'execution'
    configured: boolean
    message?: string
    digest?: string | null
    explorerUrl?: string | null
    dryRun?: {
      status: string
      success: boolean
      error: unknown
      digest?: string | null
      gasUsed?: unknown
      balanceChanges?: unknown
    }
    execution?: {
      status: string
      success: boolean
      error: unknown
      digest?: string | null
      effects?: unknown
      balanceChanges?: unknown
    } | null
    symbol?: string
    amount?: number
  } | null
  memory: { blobId: string; text: string } | null
  memoryError: string | null
  memoryCount: number
  fingerprint: { short: string; full: string }
  limits?: { alice_to_bob: number; bob_to_alice: number }
  limitAfter?: number
  deferReason?: string | null
}

export interface RecordResponse {
  memory: { blobId: string; text: string }
  state: {
    limits: { alice_to_bob: number; bob_to_alice: number }
    memoryCount: number
    lastUpdated: string
  }
  fingerprint: { short: string; full: string }
  source: 'walrus' | 'mock'
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const message =
      (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body as T
}

export const api = {
  state: (memory: boolean) =>
    request<CreditState>(`/api/credit/state?memory=${memory ? 'on' : 'off'}`),
  status: () => request<AppStatus>('/api/credit/status'),
  history: (type = 'all') =>
    request<HistoryResponse>(`/api/credit/history?type=${encodeURIComponent(type)}`),
  evaluate: (input: { direction: Direction; amount: number; purpose: string; memory: boolean }) =>
    request<Decision>('/api/credit/evaluate', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  record: (input: {
    type: InteractionType
    from: Party
    to: Party
    amount: number
    result: InteractionResult
    note?: string
  }) =>
    request<RecordResponse>('/api/credit/record', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  seed: (force = false) =>
    request<{
      seeded: Array<{ id: string; blobId: string; text: string }>
      skipped: number
      errors: Array<{ id: string; message: string }>
      alreadySeeded: boolean
      memoryCount: number
      limits: { alice_to_bob: number; bob_to_alice: number }
      fingerprint: { short: string; full: string }
    }>('/api/credit/seed', {
      method: 'POST',
      body: JSON.stringify({ force }),
    }),
  verify: (fingerprint: string) =>
    request<{
      matches: boolean
      expected: string | null
      current: { short: string; full: string }
      limits: { alice_to_bob: number; bob_to_alice: number }
      memoryCount: number
      namespace: string
      mode: string
    }>('/api/credit/verify', {
      method: 'POST',
      body: JSON.stringify({ fingerprint }),
    }),
  agentRequest: (input: { direction: Direction; amount: number; purpose: string; rail: AgentRail; maxRelease?: number }) =>
    request<AgentResponse>('/api/agent/request', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  authorizePayment: (input: { direction: Direction; requestedAmount: number; purpose: string }) =>
    request<PaymentAuthorization>('/api/payment/authorize', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  executePayment: (input: { direction: Direction; requestedAmount: number; purpose: string }) =>
    request<PaymentExecution>('/api/payment/execute', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
}
