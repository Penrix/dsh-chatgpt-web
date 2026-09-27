import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Reserve once before any live effect. Later writes belong to this run only. */
export function reserveEvidenceFile(path) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ status: 'reserved', startedAt: new Date().toISOString() }) + '\n', {
    encoding: 'utf8', flag: 'wx',
  })
}
