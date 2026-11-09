import { createHash } from 'node:crypto'
import { MemWal, MemWalMock } from '@mysten-incubation/memwal'
import { parseInteraction, serializeInteraction, compareInteractions } from './credit/schema.mjs'
import { SEED_INTERACTIONS } from './credit/seed-data.mjs'

const DEFAULT_RELAYER = 'https://relayer.memory.walrus.xyz'
const DEFAULT_NAMESPACE = 'credit-demo'
const DEFAULT_RECALL_LIMIT = 100

let client = null
let clientSignature = ''
let lastHealth = null
let lastHealthAt = 0

export function memoryConfig() {
  return {
    namespace: process.env.MEMWAL_NAMESPACE || DEFAULT_NAMESPACE,
    relayer: (process.env.MEMWAL_SERVER_URL || DEFAULT_RELAYER).replace(/\/+$/, ''),
    accountId: process.env.MEMWAL_ACCOUNT_ID || '',
    privateKey: process.env.MEMWAL_PRIVATE_KEY || '',
    mode: (process.env.MEMWAL_MODE || 'auto').toLowerCase(),
    recallLimit: Number(process.env.MEMWAL_RECALL_LIMIT || DEFAULT_RECALL_LIMIT),
  }
}

export function hasLiveCredentials() {
  const cfg = memoryConfig()
  return Boolean(cfg.accountId && cfg.privateKey)
}

export function resolveMode() {
  const cfg = memoryConfig()
  if (cfg.mode === 'mock') return 'mock'
  if (cfg.mode === 'live') {
    if (!hasLiveCredentials()) {
      throw new Error('MEMWAL_MODE=live but MEMWAL_ACCOUNT_ID / MEMWAL_PRIVATE_KEY are missing')
    }
    return 'live'
  }
  return hasLiveCredentials() ? 'live' : 'mock'
}

export function isMock() {
  return resolveMode() === 'mock'
}

function signatureFor(cfg, mode) {
  return [mode, cfg.namespace, cfg.relayer, cfg.accountId, cfg.privateKey.slice(-12)].join('|')
}

function mockSeedMemories() {
  return SEED_INTERACTIONS.map((interaction, index) => ({
    text: serializeInteraction(interaction),
    namespace: memoryConfig().namespace,
    blobId: `mockblob${String(index + 1).padStart(2, '0')}${createHash('sha256')
      .update(interaction.id)
      .digest('hex')
      .slice(0, 48)}`,
  }))
}

export function getMemoryClient() {
  const cfg = memoryConfig()
  const mode = resolveMode()
  const signature = signatureFor(cfg, mode)
  if (client && signature === clientSignature) return client

  if (mode === 'mock') {
    client = MemWalMock.create({
      namespace: cfg.namespace,
      owner: 'mock:credit-demo',
      initialMemories: mockSeedMemories(),
    })
  } else {
    client = MemWal.create({
      key: cfg.privateKey,
      accountId: cfg.accountId,
      serverUrl: cfg.relayer,
      namespace: cfg.namespace,
      requestTimeoutMs: 45_000,
      recallTimeoutMs: 20_000,
      preflightTimeoutMs: 8_000,
    })
  }
  clientSignature = signature
  return client
}

export function destroyMemoryClient() {
  if (client && typeof client.destroy === 'function') client.destroy()
  client = null
  clientSignature = ''
}

const RECALL_QUERY =
  'credit interaction history between alice and bob: repayment default advance fulfillment request, amount and result'

async function recallPage(memwal, query, limit, namespace) {
  return memwal.recall({
    query,
    limit,
    namespace,
    timeoutMs: 20_000,
  })
}

/**
 * Rebuild the policy input from Walrus on every call. The namespace is small
 * (tens of memories), so a limit of 100 returns the whole set; if it ever grows
 * past the relayer window we merge a second query so the demo degrades safely.
 */
export async function recallAll(options = {}) {
  const cfg = memoryConfig()
  const memwal = getMemoryClient()
  const limit = Math.min(Math.max(Number(options.limit ?? cfg.recallLimit) || 100, 1), 100)

  if (!isMock() && options.restore) {
    await memwal.restore(cfg.namespace, Math.min(Math.max(limit, 20), 100))
  }

  const queries = [
    RECALL_QUERY,
    'repayment success late default failed advance fulfillment alice bob settlement',
  ]
  const seen = new Map()
  const errors = []
  let total = 0

  for (const query of queries) {
    try {
      const page = await recallPage(memwal, query, limit, cfg.namespace)
      total = Math.max(total, page.total ?? 0)
      for (const item of page.results ?? []) {
        if (!item?.blob_id || seen.has(item.blob_id)) continue
        const parsed = parseInteraction(item.text, item.blob_id)
        if (!parsed) continue
        seen.set(item.blob_id, { ...parsed, distance: item.distance, createdAt: item.created_at })
      }
      if (seen.size >= limit) break
    } catch (error) {
      errors.push({ query, message: error?.message ?? String(error) })
    }
  }

  const interactions = [...seen.values()].sort(compareInteractions)
  return {
    interactions,
    total,
    recallLimit: limit,
    truncated: kindOfTruncated(total, limit, interactions.length),
    errors,
    namespace: cfg.namespace,
    mode: resolveMode(),
  }
}

function kindOfTruncated(total, limit, parsed) {
  if (total > limit) return true
  // We only know the parsed CREDIT count, not the namespace count. Treat a full
  // page as potentially truncated so the UI can warn instead of overclaiming.
  return parsed >= limit && limit > 0
}

export async function rememberInteraction(input) {
  const cfg = memoryConfig()
  const text = serializeInteraction(input)
  const key = createHash('sha256').update(text).digest('hex').slice(0, 40)
  const memwal = getMemoryClient()
  const result = await memwal.rememberAndWait(text, {
    idempotencyKey: `credit-${key}`,
    dedupe: true,
    timeoutMs: 60_000,
  })
  return {
    text,
    blobId: result.blob_id,
    id: result.blob_id,
    owner: result.owner,
    namespace: result.namespace ?? cfg.namespace,
  }
}

export async function seedMemories(options = {}) {
  const force = Boolean(options.force)
  const cfg = memoryConfig()
  const existing = await recallAll({ limit: 100 })
  const existingTexts = new Set(existing.interactions.map(i => i.text))

  if (!force && existing.interactions.length >= SEED_INTERACTIONS.length) {
    return {
      seeded: [],
      skipped: SEED_INTERACTIONS.length,
      errors: [],
      alreadySeeded: true,
      namespace: cfg.namespace,
      mode: resolveMode(),
    }
  }

  const seeded = []
  const skipped = []
  const errors = []

  for (const interaction of SEED_INTERACTIONS) {
    const text = serializeInteraction(interaction)
    if (!force && existingTexts.has(text)) {
      skipped.push({ text })
      continue
    }
    try {
      const memory = await rememberInteraction(interaction)
      seeded.push({ id: interaction.id, text: memory.text, blobId: memory.blobId })
    } catch (error) {
      errors.push({ id: interaction.id, text, message: error?.message ?? String(error) })
    }
  }

  return {
    seeded,
    skipped: skipped.length,
    errors,
    alreadySeeded: false,
    namespace: cfg.namespace,
    mode: resolveMode(),
  }
}

export async function memoryStatus() {
  const cfg = memoryConfig()
  const mode = resolveMode()
  const configured = hasLiveCredentials()

  let health = null
  if (mode === 'live') {
    const now = Date.now()
    if (!lastHealth || now - lastHealthAt > 30_000) {
      try {
        lastHealth = await Promise.race([
          getMemoryClient().health(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('health check timed out')), 6_000)),
        ])
      } catch (error) {
        lastHealth = { status: 'unreachable', error: error?.message ?? String(error) }
      }
      lastHealthAt = now
    }
    health = lastHealth
  } else {
    health = { status: 'ok', version: 'mock', mode: 'mock', write_ready: true }
  }

  return {
    mode,
    configured,
    namespace: cfg.namespace,
    relayer: mode === 'live' ? cfg.relayer : 'in-process MemWalMock',
    accountId: cfg.accountId ? `${cfg.accountId.slice(0, 8)}…${cfg.accountId.slice(-6)}` : null,
    recallLimit: cfg.recallLimit,
    health,
    source: mode === 'live' ? 'walrus' : 'mock',
    liveHint:
      mode === 'live'
        ? 'Every read is rebuilt from the Walrus Memory relayer.'
        : 'Demo mode: memories are held in-process. Add MEMWAL_ACCOUNT_ID and MEMWAL_PRIVATE_KEY (or set MEMWAL_MODE=live) to read and write real Walrus Memory.',
  }
}
