import test from 'node:test';
import assert from 'node:assert/strict';

import { hasSmtpCredentials, getMissingSmtpConfigMessage } from '../src/services/emailBackupClient';

test('hasSmtpCredentials returns false when sender email or app password is missing', () => {
  assert.equal(hasSmtpCredentials({ smtpUser: '', smtpPass: 'abc' }), false);
  assert.equal(hasSmtpCredentials({ smtpUser: 'user@example.com', smtpPass: '' }), false);
  assert.equal(hasSmtpCredentials({ smtpUser: 'user@example.com', smtpPass: 'abc' }), true);
  assert.equal(hasSmtpCredentials({ user: 'user@example.com', pass: 'abc' }), true);
});

test('getMissingSmtpConfigMessage returns Arabic guidance for first-time setup', () => {
  const message = getMissingSmtpConfigMessage();
  assert.match(message, /إدخال البريد|App Password|الإعدادات/);
});
