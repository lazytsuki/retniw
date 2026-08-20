import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'

const command = process.argv[2]
if (command !== 'dev' && command !== 'start') {
  throw new Error('Expected dev or start')
}

let deepSeekApiKey = process.env.DEEPSEEK_API_KEY
if (!deepSeekApiKey && process.platform === 'darwin') {
  try {
    deepSeekApiKey = execFileSync(
      'security',
      ['find-generic-password', '-a', 'retniw', '-s', 'retniw-deepseek-api-key', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    // Next.js may still load DEEPSEEK_API_KEY from .env.local.
  }
}

const nextBinary = path.join(process.cwd(), 'node_modules', '.bin', 'next')
const child = spawn(nextBinary, [command], {
  env: { ...process.env, ...(deepSeekApiKey ? { DEEPSEEK_API_KEY: deepSeekApiKey } : {}) },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
