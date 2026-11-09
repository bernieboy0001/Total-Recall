import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SuiGraphQLClient } from '@mysten/sui/graphql'
import { MissingApiKeyError, tatumGatewayUrl } from './tatum-client.mjs'

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

// Tatum's Sui gateways are GraphQL-only (sui-*.gateway.tatum.io/graphql).
// Everything — balances, gas price, simulate, execute — goes through that
// endpoint, so the rail stays "via Tatum" rather than hitting fullnodes.
function getTatumSuiClient(network) {
  if (!process.env.TATUM_API_KEY) throw new MissingApiKeyError('TATUM_API_KEY is not set')
  return new SuiGraphQLClient({
    url: `${tatumGatewayUrl('sui', network)}/graphql`,
    network,
    headers: { 'x-api-key': process.env.TATUM_API_KEY },
  })
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
    const client = getTatumSuiClient(cfg.network)
    const [sui, token] = await Promise.all([
      client.getBalance({ owner: address, coinType: SUI_COIN_TYPE }),
      cfg.isSui
        ? Promise.resolve(null)
        : client.getBalance({ owner: address, coinType: cfg.coinType }).catch(() => null),
    ])
    const suiUnits = sui?.balance?.balance ?? sui?.balance?.addressBalance ?? 0n
    const tokenUnits = token?.balance?.balance ?? token?.balance?.addressBalance ?? 0n
    return {
      configured: true,
      address,
      symbol: cfg.symbol,
      network: cfg.network,
      balances: {
        sui: fromBaseUnits(suiUnits, 9),
        token: cfg.isSui ? fromBaseUnits(suiUnits, 9) : fromBaseUnits(tokenUnits, cfg.decimals),
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

function buildPayment(cfg, recipient, baseUnits) {
  const tx = new Transaction()
  tx.setGasBudget(BigInt(cfg.gasBudgetMist))
  const [coin] = tx.splitCoins(tx.gas, [baseUnits])
  tx.transferObjects([coin], recipient)
  return tx
}

async function buildTokenPayment(client, cfg, recipient, baseUnits, sender) {
  const gasPrice = BigInt((await client.getReferenceGasPrice()).referenceGasPrice)
  const sui = new Transaction()
  // gas selected by SDK from sender's SUI automatically
  const tx = new Transaction()
  tx.setSender(sender)
  tx.setGasPrice(gasPrice)
  tx.setGasBudget(BigInt(cfg.gasBudgetMist))

  const result = await client.listCoins({ owner: sender, coinType: cfg.coinType })
  const tokenCoins = result?.coins ?? result?.objects ?? []
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
  const primaryId = selected[0].coinObjectId ?? selected[0].objectId ?? selected[0].address
  const primary = tx.object(primaryId)
  if (selected.length > 1) {
    tx.mergeCoins(
      primary,
      selected.slice(1).map(coin => tx.object(coin.coinObjectId ?? coin.objectId ?? coin.address)),
    )
  }
  const [coin] = tx.splitCoins(primary, [baseUnits])
  tx.transferObjects([coin], recipient)
  return tx
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

  const client = getTatumSuiClient(cfg.network)
  const tx = cfg.isSui
    ? buildPayment(cfg, recipient, baseUnits)
    : await buildTokenPayment(client, cfg, recipient, baseUnits, sender)
  tx.setSender(sender)

  const gasPrice = BigInt((await client.getReferenceGasPrice()).referenceGasPrice)
  tx.setGasPrice(gasPrice)

  const bytes = await tx.build({ client })
  const { signature } = await keypair.signTransaction(bytes)

  return {
    tx,
    bytes,
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
  const client = getTatumSuiClient(built.network)
  const sim = await client.simulateTransaction({
    transaction: built.tx,
    include: { effects: true, balanceChanges: true },
  })
  const txr = sim.Transaction ?? sim.FailedTransaction ?? null
  const success = sim.$kind === 'Transaction' && txr?.status?.success === true
  return {
    sender: built.sender,
    recipient: built.recipient,
    amount: built.amount,
    baseUnits: built.baseUnits,
    symbol: built.symbol,
    coinType: built.coinType,
    network: built.network,
    gasBudgetMist: built.gasBudgetMist,
    dryRun: {
      status: success ? 'success' : 'failed',
      success,
      error: txr?.status?.error ?? null,
      digest: txr?.digest ?? null,
      gasUsed: txr?.gasEffects ?? null,
      balanceChanges: txr?.balanceChanges ?? null,
      commandResults: null,
    },
  }
}

export async function executePayment(options = {}) {
  const built = await buildPaymentTransaction(options)
  const client = getTatumSuiClient(built.network)
  const result = await client.signAndExecuteTransaction({
    transaction: built.tx,
    signer: getAgentKeypair(),
    include: { effects: true, balanceChanges: true },
  })
  const txr = result.Transaction ?? result.FailedTransaction ?? null
  const success = result.$kind === 'Transaction' && txr?.status?.success === true
  const digest = txr?.digest ?? null
  return {
    sender: built.sender,
    recipient: built.recipient,
    amount: built.amount,
    baseUnits: built.baseUnits,
    symbol: built.symbol,
    coinType: built.coinType,
    network: built.network,
    digest,
    explorerUrl: digest ? `${paymentConfig().explorerBase}/tx/${digest}` : null,
    execution: {
      status: success ? 'success' : 'failed',
      success,
      error: txr?.status?.error ?? null,
      digest,
      effects: txr?.effects ?? null,
      balanceChanges: txr?.balanceChanges ?? null,
    },
  }
}
