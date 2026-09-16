import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export function connectCodex() {
  const process = spawn('codex', ['app-server', '--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let nextId = 0;
  let stderr = '';
  const lines = createInterface({ input: process.stdout });

  process.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (!pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  process.on('exit', (code) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(`Codex App Server exited (${code}): ${stderr.trim()}`));
    }
    pending.clear();
  });

  function request(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      process.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  async function initialize() {
    await request('initialize', {
      clientInfo: { name: 'codex_daybook', title: 'Codex Daybook', version: '0.1.0' },
    });
    process.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
  }

  function close() {
    process.stdin.end();
    setTimeout(() => { if (process.exitCode === null) process.kill(); }, 1000).unref();
  }

  return { request, initialize, close };
}
