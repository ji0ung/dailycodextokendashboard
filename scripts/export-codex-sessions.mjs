#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { classifyConversation, cleanConversationText, displayTitle, isOpenClawConversation } from './clean-conversation-text.mjs';

const sessionsDirectory = process.argv[2] || join(homedir(), '.codex', 'sessions');
const outputPath = process.argv[3] || resolve('data/codex-sessions.json');
const activityGapMs = 15 * 60 * 1000;

async function findJsonlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findJsonlFiles(path);
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : [];
  }));
  return paths.flat();
}

function messageText(event) {
  const content = event?.payload?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((item) => item?.type === 'input_text' || item?.type === 'text')
    .map((item) => item.text || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanUserText(text) {
  return cleanConversationText(text).replace(/^<[^>]+>\s*/g, '').trim();
}

function toTitle(text) {
  return displayTitle(cleanUserText(text));
}

function parseSession(filePath, source) {
  const lines = source.split('\n').filter(Boolean);
  const events = lines.flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const timestamps = events
    .map((event) => Date.parse(event.timestamp))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!timestamps.length) return null;

  const firstUserMessage = events.find((event) => {
    return event.type === 'response_item'
      && event.payload?.role === 'user'
      && cleanUserText(messageText(event));
  });
  const rawFirstUserText = messageText(firstUserMessage);
  const sessionMeta = events.find((event) => event.type === 'session_meta')?.payload;
  const category = isOpenClawConversation(rawFirstUserText, sessionMeta?.cwd) ? 'openclaw' : 'work';
  const topic = classifyConversation(rawFirstUserText, category === 'openclaw');
  const title = category === 'openclaw' ? 'OpenClaw와의 대화' : toTitle(rawFirstUserText);
  const tokenTotals = events
    .filter((event) => event.type === 'event_msg')
    .map((event) => event.payload?.info?.total_token_usage?.total_tokens)
    .filter(Number.isFinite);
  const latestUsage = events
    .filter((event) => event.type === 'event_msg' && event.payload?.info?.total_token_usage)
    .at(-1)?.payload.info.total_token_usage || {};
  const requestCount = events.filter((event) => {
    return event.type === 'response_item'
      && event.payload?.role === 'user'
      && cleanUserText(messageText(event));
  }).length;
  const modelCounts = events.reduce((counts, event) => {
    const model = event.type === 'turn_context'
      ? event.payload?.model
      : event.payload?.type === 'thread_settings_applied' ? event.payload?.thread_settings?.model : null;
    if (model) counts.set(model, (counts.get(model) || 0) + 1);
    return counts;
  }, new Map());
  const primaryModel = [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  const activeMs = timestamps.slice(1).reduce((total, timestamp, index) => {
    return total + Math.min(timestamp - timestamps[index], activityGapMs);
  }, 0);

  return {
    id: sessionMeta?.id || basename(filePath, '.jsonl'),
    title,
    category,
    topic,
    start: new Date(timestamps[0]).toISOString(),
    update: new Date(timestamps.at(-1)).toISOString(),
    minutes: Math.max(1, Math.round(activeMs / 60000)),
    totalTokens: tokenTotals.length ? Math.max(...tokenTotals) : 0,
    inputTokens: latestUsage.input_tokens || 0,
    cachedInputTokens: latestUsage.cached_input_tokens || 0,
    outputTokens: latestUsage.output_tokens || 0,
    reasoningTokens: latestUsage.reasoning_output_tokens || 0,
    requestCount,
    primaryModel,
    status: 'Codex 로컬 세션',
  };
}

const files = await findJsonlFiles(sessionsDirectory);
const conversations = (await Promise.all(files.map(async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  return parseSession(filePath, source);
})))
  .filter(Boolean)
  .sort((a, b) => Date.parse(b.update) - Date.parse(a.update));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  conversations,
}, null, 2)}\n`);

console.log(`${conversations.length}개 세션을 ${outputPath}에 저장했습니다.`);
