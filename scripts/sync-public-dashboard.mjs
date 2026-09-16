#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOperationsStore } from './operations-store.mjs';
import { withRetry } from './retry.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const gistId = process.env.CODEX_DAYBOOK_GIST_ID || process.argv[2];
const outputPath = join(root, 'data', 'public-dashboard.json');
const userKey = process.env.DAYBOOK_USER_KEY || 'local-owner';
const store = createOperationsStore(join(root, 'data', 'operations.db'));
const runId = store.start(userKey);
const topicLabels = { development: '개발', research: '리서치·기획', content: '콘텐츠', career: '취업·커리어', learning: '학습·실습', documentation: '파일·문서', troubleshooting: '운영·문제해결', other: '기타' };

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

function dateKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function koreanHour(value) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(new Date(value)));
}

function todayHourly(rows) {
  const today = dateKey(new Date());
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: 0 }));
  for (const row of rows) {
    if (row.category === 'openclaw') continue;
    for (const point of row.tokenTimeline || []) {
      if (dateKey(point.timestamp) === today) hours[koreanHour(point.timestamp)].tokens += point.totalTokens;
    }
  }
  return hours;
}

function periodSummary(rows, days) {
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  const filtered = rows.filter((row) => dateKey(row.update) >= dateKey(start));
  const work = filtered.filter((row) => row.category !== 'openclaw');
  const openclaw = filtered.filter((row) => row.category === 'openclaw');
  const topics = Object.entries(work.reduce((counts, row) => {
    counts[row.topic] = (counts[row.topic] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic, count]) => ({ label: topicLabels[topic] || '기타', count }));
  const workMinutes = work.reduce((sum, row) => sum + row.minutes, 0);
  const openclawMinutes = openclaw.reduce((sum, row) => sum + row.minutes, 0);
  const input = work.reduce((sum, row) => sum + row.inputTokens, 0);
  const cached = work.reduce((sum, row) => sum + row.cachedInputTokens, 0);
  return {
    workMinutes,
    openclawMinutes,
    workCount: work.length,
    openclawCount: openclaw.length,
    totalTokens: work.reduce((sum, row) => sum + row.totalTokens, 0),
    cacheRate: input ? cached / input : 0,
    efficientCount: work.filter((row) => row.inputTokens && row.cachedInputTokens / row.inputTokens >= 0.8).length,
    topics,
  };
}

try {
  const exportResult = await withRetry(() => run(process.execPath, [join(root, 'scripts/export-codex-sessions.mjs')]));
  const rows = JSON.parse(await readFile(join(root, 'data/codex-sessions.json'), 'utf8')).conversations;
  const payload = {
    generatedAt: new Date().toISOString(),
    privacy: 'aggregate-only',
    timezone: 'Asia/Seoul',
    hourly: todayHourly(rows),
    periods: {
      day: periodSummary(rows, 1),
      week: periodSummary(rows, 7),
      month: periodSummary(rows, 30),
    },
  };
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  const publishResult = gistId
    ? await withRetry(() => run(process.env.GH_BIN || '/usr/local/bin/gh', ['gist', 'edit', gistId, '--filename', 'public-dashboard.json', outputPath]))
    : { attempts: 0 };
  const day = payload.periods.day;
  store.finish(runId, { status: 'succeeded', attempts: Math.max(exportResult.attempts, publishResult.attempts), workCount: day.workCount, totalTokens: day.totalTokens });
  console.log(`공개 집계 갱신: ${payload.generatedAt}`);
} catch (error) {
  store.finish(runId, { status: 'failed', attempts: error.attempts || 1, errorMessage: error.message.slice(0, 500) });
  throw error;
} finally {
  store.close();
}
