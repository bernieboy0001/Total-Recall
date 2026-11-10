// API-only Express app: no Vite, no listener. Imported by server/index.mjs (local
// dev and the single-process container preview) and api/index.js (Vercel serverless).
// All state comes from Walrus Memory when MEMWAL_ACCOUNT_ID/MEMWAL_PRIVATE_KEY are
// present, or from the deterministic in-process mock otherwise — the app boots and
// answers identically either way.
import express from 'express'
import tatumRoutes from './routes/tatum.mjs'
import creditRoutes from './routes/credit.mjs'
import paymentRoutes from './routes/payment.mjs'
import agentRoutes from './routes/agent.mjs'
import { credentialGuard } from './credential-guard.mjs'

const app = express()
app.use(express.json())

// Redact the Tatum API key from every response before it leaves the process.
app.use(credentialGuard)

app.use('/api/tatum', tatumRoutes)
app.use('/api/credit', creditRoutes)
app.use('/api/payment', paymentRoutes)
app.use('/api/agent', agentRoutes)

// API errors stay JSON — Vite's dev middleware would otherwise turn a rejected
// route into an HTML error page the dashboard cannot parse.
app.use('/api', (error, _req, res, _next) => {
  if (res.headersSent) return
  const status =
    error?.status ??
    (error?.name === 'MissingApiKeyError' || error?.name === 'PaymentNotConfiguredError' ? 503 : 500)
  console.error(`[api] ${error?.name ?? 'Error'}: ${error?.message ?? error}`)
  res.status(status).json({
    error: error?.message ?? 'Unexpected server error',
    code: error?.name ?? 'Error',
  })
})

export default app
