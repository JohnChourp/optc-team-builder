/**
 * 869f33bru. Builds a value shaped like a secret, at runtime, for tests that must prove a guard
 * refuses one.
 *
 * Why a helper rather than a literal: GitHub secret scanning alert #1 was exactly such a literal -
 * a fake Google API key in `scripts/check-app-config.spec.ts` - and it was published as
 * `publicly_leaked`. A literal cannot be told apart from a real key by anyone reading the
 * repository, including every scanner. Pieces joined at runtime never exist as one string in a
 * file, so `npm run secrets:scan` stays at zero findings with no allowlist.
 *
 * The bodies are deterministic filler (`fill`), not random, so a failing test is reproducible.
 */

/** `length` characters cycling through `alphabet`. Deterministic by design. */
export function fill(length, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  let out = '';

  for (let index = 0; index < length; index += 1) {
    out += alphabet[index % alphabet.length];
  }

  return out;
}

const join = (...parts) => parts.join('');

/** One secret-shaped value per rule id in `scripts/lib/secret-scan.mjs`. */
export const SECRET_FIXTURES = Object.freeze({
  'google-api-key': () => join('AI', 'za', 'Sy', fill(33, 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456')),
  'google-oauth-client-secret': () => join('GOC', 'SPX', '-', fill(28)),
  'google-service-account': () => join('{"type": "', 'service', '_account"}'),
  'private-key-block': () => join('-----BEGIN ', 'PRIVATE', ' KEY-----'),
  'aws-access-key-id': () => join('AK', 'IA', fill(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')),
  'aws-secret-access-key': () => join('aws_secret', '_access_key = "', fill(40, 'AbCdEf0123456789/+'), '"'),
  'github-token': () => join('gh', 'p_', fill(36)),
  'github-fine-grained-token': () => join('github', '_pat_', fill(82)),
  'slack-token': () => join('xo', 'xb-', fill(24)),
  'slack-webhook': () =>
    join('https://hooks.slack.com/', 'services/', 'T', fill(9, 'ABCDEFGH0123'), '/B', fill(9, 'ABCDEFGH0123'), '/', fill(24)),
  'stripe-secret-key': () => join('sk', '_live_', fill(24)),
  'clickup-token': () => join('pk', '_', '12345678', '_', fill(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')),
  'npm-token': () => join('np', 'm_', fill(36)),
  'openai-api-key': () => join('sk', '-proj-', fill(24), 'T3Blbk', 'FJ', fill(24)),
  'anthropic-api-key': () => join('sk', '-ant-', 'api03-', fill(95)),
  'sendgrid-api-key': () => join('SG', '.', fill(22), '.', fill(43)),
  'firebase-server-key': () => join('AAAA', fill(7), ':APA', '91b', fill(134)),
  'telegram-bot-token': () => join('123456789', ':AA', fill(33)),
  'azure-storage-key': () => join('Account', 'Key=', fill(86, 'AbCdEf0123456789+/'), '=='),
  jwt: () => join('ey', 'J', fill(20), '.ey', 'J', fill(20), '.', fill(20)),
  'credentials-in-url': () => join('postgres', '://', 'owner', ':', 's3cr3tP4ss', '@', 'db.example.com/prod'),
  'generic-secret-assignment': () => join('client', '_secret = "', 'Zk3q9Xw2Lm7Rt5Vb8Nc1', '"'),
});
