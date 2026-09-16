import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAuthStore } from './auth-store.mjs';

test('creates an owner and authenticates an opaque session', () => {
  const dir = mkdtempSync(join(tmpdir(), 'daybook-auth-'));
  const store = createAuthStore(join(dir, 'auth.db'));
  try {
    assert.equal(store.needsSetup(), true);
    store.createOwner('Owner@Example.com', 'correct horse battery staple');
    assert.equal(store.needsSetup(), false);
    assert.equal(store.login('owner@example.com', 'wrong'), null);
    const login = store.login('owner@example.com', 'correct horse battery staple');
    assert.equal(store.authenticate(login.token).userKey, 'local-owner');
    const session = store.authenticate(login.token);
    store.logout(session.tokenHash);
    assert.equal(store.authenticate(login.token), null);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
