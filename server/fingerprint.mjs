import { createHash } from 'node:crypto'

export function fingerprint(interactions) {
  const canonical = interactions
    .slice()
    .sort((a, b) => String(a.blobId ?? a.id).localeCompare(String(b.blobId ?? b.id)))
    .map(i => `${i.blobId ?? i.id}\n${i.text}`)
    .join('\n')
  const full = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return { short: full.slice(0, 16), full }
}
