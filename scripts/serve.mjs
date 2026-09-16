import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { connectCodex } from './codex-app-server.mjs';
import { cleanConversationText, displayTitle } from './clean-conversation-text.mjs';
import { createOperationsStore } from './operations-store.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.DAYBOOK_PORT || 4173);
let inFlight;
const markdown = new MarkdownIt({ html: false, linkify: false });

function refreshLocalSessions() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts/export-codex-sessions.mjs')], {
      cwd: root,
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Local session export failed')));
  });
}

async function getDashboard() {
  const codex = connectCodex();
  try {
    await codex.initialize();
    const [usage, localExport] = await Promise.all([
      codex.request('account/usage/read'),
      refreshLocalSessions().then(() => readFile(join(root, 'data/codex-sessions.json'), 'utf8')),
    ]);
    const local = new Map(JSON.parse(localExport).conversations.map((row) => [row.id, row]));
    const page = await codex.request('thread/list', {
      limit: 100,
      sortKey: 'updated_at',
      sourceKinds: ['cli', 'vscode', 'appServer', 'exec', 'unknown'],
    });
    const threads = page.data;

    return {
      generatedAt: new Date().toISOString(),
      usage: {
        summary: usage.summary || null,
        dailyUsageBuckets: usage.dailyUsageBuckets || [],
      },
      conversations: threads.map((thread) => {
        const log = local.get(thread.id);
        return {
          id: thread.id,
          title: log?.category === 'openclaw' ? 'OpenClaw와의 대화' : displayTitle(thread.name || thread.preview || log?.title),
          category: log?.category || 'work',
          topic: log?.topic || 'other',
          start: new Date(thread.createdAt * 1000).toISOString(),
          update: new Date(thread.updatedAt * 1000).toISOString(),
          minutes: log?.minutes || 0,
          totalTokens: log?.totalTokens || 0,
          inputTokens: log?.inputTokens || 0,
          cachedInputTokens: log?.cachedInputTokens || 0,
          outputTokens: log?.outputTokens || 0,
          reasoningTokens: log?.reasoningTokens || 0,
          requestCount: log?.requestCount || 0,
          primaryModel: log?.primaryModel || 'unknown',
          status: thread.status?.type === 'active' ? '작업 중' : 'Codex 대화',
        };
      }),
    };
  } finally {
    codex.close();
  }
}

async function getConversation(threadId) {
  const codex = connectCodex();
  try {
    await codex.initialize();
    const result = await codex.request('thread/read', { threadId, includeTurns: true }, 60000);
    const thread = result.thread;
    const turns = (thread.turns || []).map((turn, index) => {
      const requests = turn.items
        .filter((item) => item.type === 'userMessage')
        .flatMap((item) => item.content || [])
        .filter((content) => content.type === 'text')
        .map((content) => cleanConversationText(content.text));
      const messages = turn.items.filter((item) => item.type === 'agentMessage');
      const answer = messages.filter((item) => item.phase === 'final_answer').map((item) => item.text).join('\n\n');
      const progress = messages.filter((item) => item.phase === 'commentary').map((item) => item.text);
      const requestText = requests.join('\n\n').trim();
      return {
        number: index + 1,
        startedAt: turn.startedAt ? new Date(turn.startedAt * 1000).toISOString() : null,
        durationMs: turn.durationMs || null,
        requestHtml: markdown.render(requestText),
        requestLength: requestText.length,
        requestPreview: requestText.replace(/\s+/g, ' ').slice(0, 220),
        progressHtml: progress.map((message) => markdown.render(message)),
        answerHtml: markdown.render(answer),
        answerText: answer,
      };
    });
    const lastAnswer = [...turns].reverse().find((turn) => turn.answerText)?.answerText || '';
    const firstParagraph = lastAnswer.split(/\n\s*\n/).find((part) => part.trim()) || '';
    return {
      id: thread.id,
      title: displayTitle(thread.name || thread.preview),
      summaryHtml: markdown.render(firstParagraph),
      turns: turns.map(({ answerText, ...turn }) => turn),
    };
  } finally {
    codex.close();
  }
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (pathname === '/api/dashboard') {
    try {
      inFlight ||= getDashboard().finally(() => { inFlight = undefined; });
      const data = await inFlight;
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(data));
    } catch (error) {
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === '/api/conversation') {
    const threadId = new URL(request.url, 'http://localhost').searchParams.get('id');
    if (!threadId || !/^[a-f0-9-]{36}$/.test(threadId)) {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Invalid conversation id' }));
      return;
    }
    try {
      const detail = await getConversation(threadId);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(detail));
    } catch (error) {
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === '/api/operations') {
    const store = createOperationsStore(join(root, 'data', 'operations.db'));
    try {
      const runs = store.list(process.env.DAYBOOK_USER_KEY || 'local-owner', 20);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ runs }));
    } finally {
      store.close();
    }
    return;
  }
  if (pathname === '/' || pathname === '/index.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(join(root, 'index.html')));
    return;
  }
  response.writeHead(404);
  response.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Codex Daybook: http://127.0.0.1:${port}/`);
});
