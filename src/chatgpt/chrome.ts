import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'

export function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return resolve(path)
}

export function defaultProfileDir(): string {
  return join(homedir(), '.dsh-chatgpt-web-penrix', 'chrome-profile')
}

export function resolveChromeExecutable(explicit?: string): string {
  if (explicit) {
    const resolved = expandHomePath(explicit)
    if (!existsSync(resolved)) throw new Error(`Configured Chrome executable does not exist: ${resolved}`)
    return resolved
  }

  const candidates = platform() === 'win32'
    ? [
        join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : platform() === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/microsoft-edge',
        ]

  const found = candidates.find(candidate => candidate.length > 0 && existsSync(candidate))
  if (!found) throw new Error('Chrome/Edge executable not found. Set chromeExecutablePath explicitly.')
  return found
}
