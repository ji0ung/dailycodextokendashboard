import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 210000;

function passwordHash(password, salt) {
  return pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha512');
}

export function createAuthStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users');
  const insertUser = db.prepare('INSERT INTO users (user_key, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)');
  const findUser = db.prepare('SELECT id, user_key AS userKey, email, password_salt AS salt, password_hash AS hash FROM users WHERE email = ?');
  const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
  const findSession = db.prepare('SELECT users.user_key AS userKey, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  return {
    needsSetup() { return userCount.get().count === 0; },
    createOwner(email, password) {
      if (!this.needsSetup()) throw new Error('Owner already exists');
      const salt = randomBytes(16);
      insertUser.run('local-owner', email.toLowerCase(), salt.toString('hex'), passwordHash(password, salt).toString('hex'), new Date().toISOString());
    },
    login(email, password) {
      const user = findUser.get(email.toLowerCase());
      if (!user) return null;
      const expected = Buffer.from(user.hash, 'hex');
      const actual = passwordHash(password, Buffer.from(user.salt, 'hex'));
      if (!timingSafeEqual(expected, actual)) return null;
      const token = randomBytes(32).toString('base64url');
      const now = new Date();
      const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      insertSession.run(passwordHash(token, Buffer.from(user.salt, 'hex')).toString('hex'), user.id, now.toISOString(), expires.toISOString());
      return { token, expires, user: { userKey: user.userKey, email: user.email } };
    },
    authenticate(token) {
      if (!token) return null;
      const users = db.prepare('SELECT password_salt AS salt FROM users').all();
      for (const user of users) {
        const hash = passwordHash(token, Buffer.from(user.salt, 'hex')).toString('hex');
        const session = findSession.get(hash, new Date().toISOString());
        if (session) return { ...session, tokenHash: hash };
      }
      return null;
    },
    logout(tokenHash) { if (tokenHash) deleteSession.run(tokenHash); },
    close() { db.close(); },
  };
}
