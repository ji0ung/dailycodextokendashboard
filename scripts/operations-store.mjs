import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createOperationsStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      work_count INTEGER,
      total_tokens INTEGER,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS sync_runs_user_started ON sync_runs(user_key, started_at DESC);
  `);
  const startStatement = db.prepare("INSERT INTO sync_runs (user_key, started_at, status) VALUES (?, ?, 'running')");
  const finishStatement = db.prepare("UPDATE sync_runs SET finished_at = ?, status = ?, attempts = ?, work_count = ?, total_tokens = ?, error_message = ? WHERE id = ?");
  const listStatement = db.prepare('SELECT id, user_key AS userKey, started_at AS startedAt, finished_at AS finishedAt, status, attempts, work_count AS workCount, total_tokens AS totalTokens, error_message AS errorMessage FROM sync_runs WHERE user_key = ? ORDER BY id DESC LIMIT ?');
  return {
    start(userKey) {
      return Number(startStatement.run(userKey, new Date().toISOString()).lastInsertRowid);
    },
    finish(id, result) {
      finishStatement.run(new Date().toISOString(), result.status, result.attempts || 0, result.workCount ?? null, result.totalTokens ?? null, result.errorMessage || null, id);
    },
    list(userKey, limit = 20) {
      return listStatement.all(userKey, Math.min(Math.max(limit, 1), 100));
    },
    close() { db.close(); },
  };
}
