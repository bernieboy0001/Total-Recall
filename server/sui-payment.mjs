import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { MissingApiKeyError, tatumRpc } from './tatum-client.mjs'

const SUI_COIN_TYPE = '0x2::sui::SUI'
const DEFAULT_GAS_BUDGET = 10_000_000 // 0.01 SUI

export class PaymentNotConfiguredError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PaymentNotConfiguredError'
  }
}

export function paymentConfig() {
  const network = (process.env.SUI_NETWORK || 'mainnet').toLowerCase()
  const coinType = process.env.PAYMENT_COIN_TYPE || SUI_COIN_TYPE
  const isSui = coinType === SUI_COIN_TYPE
  const decimals = Number(process.env.PAYMENT_COIN_DECIMALS || (isSui ? 9 : 6))
  const symbol = process.env.PAYMENT_SYMBOL || (isSui ? 'SUI' : 'USDC')
  const amount = Number(process.env.PAYMENT_AMOUNT || (isSui ? 0.01 : 0.05))
  const gasBudgetMist = Number(process.env.PAYMENT_GAS_BUDGET_MIST || DEFAULT_GAS_BUDGET)
  const hasKey = Boolean(process.env.SUI_AGENT_PRIVATE_KEY)
  const recipient = process.env.PAYMENT_RECIPIENT || ''

  return {
    network,
    coinType,
    isSui,
    decimals,
    symbol,
    amount,
    gasBudgetMist,
    recipient,
    hasKey,
    enabled: hasKey,
    configured: hasKey,
    tatumConfigured: Boolean(process.env.TATUM_API_KEY),
    explorerBase: `https://suiscan.xyz/${network}`,
  }
}

export function getAgentKeypair() {
  const secret = process.env.SUI_AGENT_PRIVATE_KEY
  if (!secret) return null
  const trimmed = secret.trim()
  const hex = trimmed.replace(/^0x/i, '')
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'))
  }
  return Ed25519Keypair.fromSecretKey(trimmed)
}

export function agentAddress() {
  const keypair = getAgentKeypair()
  return keypair ? keypair.getPublicKey().toSuiAddress() : null
}

function rpcError(body, method, status) {
  const detail = body?.error?.message || body?.error || body?.message || 'unknown Tatum RPC error'
  return new Error(`Tatum ${method}${status ? ` (HTTP ${status})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

async function rpc(method, params, network) {
  let response
  try {
    response = await tatumRpc(
      'sui',
      { jsonrpc: '2.0', id: 1, method, params },
      network,
    )
  } catch (error) {
    if (error instanceof MissingApiKeyError) throw error
    throw new Error(`Tatum ${method} request failed: ${error?.message ?? String(error)}`)
  }
  let body
  try {
    body = await response.json()
  } catch {
    throw rpcError(null, method, response.status)
  }
  if (!response.ok || body?.error) throw rpcError(body, method, response.status)
  return body.result
}

function toBaseUnits(amount, decimals) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be positive')
  const factor = 10 ** decimals
  const scaled = Math.round(amount * factor)
  if (!Number.isSafeInteger(scaled) || scaled <= 0) throw new Error('Payment amount is too small or too large')
  return BigInt(scaled)
}

function fromBaseUnits(value, decimals) {
  const base = BigInt(value ?? 0)
  const divisor = 10n ** BigInt(decimals)
  const whole = base / divisor
  const fraction = (base % divisor).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : `${whole}`
}

function objectRef(coin) {
  return { objectId: coin.coinObjectId, version: coin.version, digest: coin.digest }
}

async function getCoins(owner, coinType, network) {
  const result = await rpc('suix_getCoins', [owner, coinType, null, 50], network)
  return result?.data ?? []
}

function pickCoin(coins, minimum) {
  return coins
    .slice()
    .sort((a, b) => {
      const delta = BigInt(b.balance) - BigInt(a.balance)
      return delta > 0n ? 1 : delta < 0n ? -1 : 0
    })
    .find(coin => BigInt(coin.balance) >= minimum)
}

export async function getBalances() {
  const cfg = paymentConfig()
  const address = agentAddress()
  if (!address) {
    return {
      configured: false,
      address: null,
      symbol: cfg.symbol,
      balances: null,
      reason: 'SUI_AGENT_PRIVATE_KEY is not set',
    }
  }
  if (!cfg.tatumConfigured) {
    return {
      configured: true,
      address,
      symbol: cfg.symbol,
      balances: null,
      reason: 'TATUM_API_KEY is not set',
    }
  }

  try {
    const [sui, token] = await Promise.all([
      rpc('suix_getBalance', [address, SUI_COIN_TYPE], cfg.network),
      cfg.isSui
        ? Promise.resolve(null)
        : rpc('suix_getBalance', [address, cfg.coinType], cfg.network),
    ])
    return {
      configured: true,
      address,
      symbol: cfg.symbol,
      network: cfg.network,
      balances: {
        sui: fromBaseUnits(sui?.totalBalance, 9),
        token: cfg.isSui ? fromBaseUnits(sui?.totalBalance, 9) : fromBaseUnits(token?.totalBalance, cfg.decimals),
        tokenSymbol: cfg.isSui ? 'SUI' : cfg.symbol,
      },
    }
  } catch (error) {
    return {
      configured: true,
      address,
      symbol: cfg.symbol,
      balances: null,
      error: error?.message ?? String(error),
    }
  }
}

export async function buildPaymentTransaction(options = {}) {
  const cfg = paymentConfig()
  if (!cfg.hasKey) {
    throw new PaymentNotConfiguredError(
      'Agent payments are disabled. Set SUI_AGENT_PRIVATE_KEY (and optionally PAYMENT_COIN_TYPE, PAYMENT_RECIPIENT) to enable them.',
    )
  }
  if (!cfg.tatumConfigured) {
    throw new PaymentNotConfiguredError('TATUM_API_KEY is missing; the Sui gateway cannot be reached.')
  }

  const keypair = getAgentKeypair()
  const sender = keypair.getPublicKey().toSuiAddress()
  const recipient = options.recipient || cfg.recipient || sender
  const amount = Number(options.amount ?? cfg.amount)
  const baseUnits = toBaseUnits(amount, cfg.decimals)
  const gasBudget = BigInt(cfg.gasBudgetMist)

  const [gasPriceRaw, suiCoins] = await Promise.all([
    rpc('suix_getReferenceGasPrice', [], cfg.network),
    getCoins(sender, SUI_COIN_TYPE, cfg.network),
  ])
  const gasPrice = BigInt(gasPriceRaw)

  const tx = new Transaction()
  tx.setSender(sender)
  tx.setGasBudget(gasBudget)
  tx.setGasPrice(gasPrice)

  if (cfg.isSui) {
    const gasCoin = pickCoin(suiCoins, baseUnits + gasBudget)
    if (!gasCoin) {
      throw new PaymentNotConfiguredError(
        `Agent wallet ${sender} needs at least ${fromBaseUnits(baseUnits + gasBudget, 9)} SUI (payment + gas).`,
      )
    }
    tx.setGasPayment([objectRef(gasCoin)])
    const [coin] = tx.splitCoins(tx.gas, [baseUnits])
    tx.transferObjects([coin], recipient)
  } else {
    const gasCoin = pickCoin(suiCoins, gasBudget)
    if (!gasCoin) {
      throw new PaymentNotConfiguredError(
        `Agent wallet ${sender} needs at least ${fromBaseUnits(gasBudget, 9)} SUI for gas.`,
      )
    }
    tx.setGasPayment([objectRef(gasCoin)])

    const tokenCoins = await getCoins(sender, cfg.coinType, cfg.network)
    const selected = []
    let sum = 0n
    for (const coin of tokenCoins.slice().sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))) {
      selected.push(coin)
      sum += BigInt(coin.balance)
      if (sum >= baseUnits) break
    }
    if (sum < baseUnits) {
      throw new PaymentNotConfiguredError(
        `Agent wallet ${sender} needs ${fromBaseUnits(baseUnits, cfg.decimals)} ${cfg.symbol} to pay.`,
      )
    }

    const primary = tx.object(objectRef(selected[0]))
    if (selected.length > 1) {
      tx.mergeCoins(
        primary,
        selected.slice(1).map(coin => tx.object(objectRef(coin))),
      )
    }
    const [coin] = tx.splitCoins(primary, [baseUnits])
    tx.transferObjects([coin], recipient)
  }

  const bytes = await tx.build()
  const { signature } = await keypair.signTransaction(bytes)

  return {
    bytes: Buffer.from(bytes).toString('base64'),
    signature,
    sender,
    recipient,
    amount,
    baseUnits: baseUnits.toString(),
    symbol: cfg.symbol,
    coinType: cfg.coinType,
    network: cfg.network,
    gasBudgetMist: cfg.gasBudgetMist.toString(),
  }
}

export async function dryRunPayment(options = {}) {
  const built = await buildPaymentTransaction(options)
  const result = await rpc('sui_dryRunTransactionBlock', [built.bytes], built.network)
  const status = result?.effects?.status?.status ?? 'unknown'
  return {
    ...built,
    bytes: undefined,
    signature: undefined,
    dryRun: {
      status,
      success: status === 'success',
      error: result?.effects?.status?.error ?? null,
      gasUsed: result?.effects?.gasUsed ?? null,
      effects: result?.effects ?? null,
      objectChanges: result?.objectChanges ?? null,
      balanceChanges: result?.balanceChanges ?? null,
    },
  }
}

export async function executePayment(options = {}) {
  const built = await buildPaymentTransaction(options)
  const result = await rpc(
    'sui_executeTransactionBlock',
    [
      built.bytes,
      [built.signature],
      { showEffects: true, showEvents: true, showObjectChanges: true, showBalanceChanges: true },
      'WaitForLocalExecution',
    ],
    built.network,
  )
  const status = result?.effects?.status?.status ?? 'unknown'
  const digest = result?.digest ?? null
  return {
    ...built,
    bytes: undefined,
    signature: undefined,
    digest,
    explorerUrl: digest ? `${paymentConfig().explorerBase}/tx/${digest}` : null,
    execution: {
      status,
      success: status === 'success',
      error: result?.effects?.status?.error ?? null,
      effects: result?.effects ?? null,
      events: result?.events ?? null,
      balanceChanges: result?.balanceChanges ?? null,
    },
  }
}
