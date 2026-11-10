// Vercel serverless entry — same API app the local dev server uses, wrapped in a
// single serverless function. Static frontend is served from dist/ (see vercel.json).
import app from '../server/app.mjs'

export default function handler(req, res) {
  return app(req, res)
}
