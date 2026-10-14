/// <reference types="jest" />
/**
 * Unit tests for authentication service logic.
 * Tests password hashing and token operations without real DB.
 */

describe('Authentication — password hashing', () => {
  // Import inline to avoid DB connection in these unit tests
  let hashPassword: (p: string) => Promise<string>;
  let verifyPassword: (h: string, p: string) => Promise<boolean>;

  beforeAll(async () => {
    const authModule = await import('../src/modules/auth/auth.service');
    hashPassword = authModule.hashPassword;
    verifyPassword = authModule.verifyPassword;
  });

  test('hashes a password with Argon2id', async () => {
    const hash = await hashPassword('TestPassword123!');
    expect(hash).toMatch(/^\$argon2id/);
  });

  test('verifies correct password', async () => {
    const hash = await hashPassword('CorrectPassword!');
    const valid = await verifyPassword(hash, 'CorrectPassword!');
    expect(valid).toBe(true);
  });

  test('rejects incorrect password', async () => {
    const hash = await hashPassword('CorrectPassword!');
    const valid = await verifyPassword(hash, 'WrongPassword!');
    expect(valid).toBe(false);
  });

  test('produces different hashes for the same password (salted)', async () => {
    const hash1 = await hashPassword('SamePassword!');
    const hash2 = await hashPassword('SamePassword!');
    expect(hash1).not.toBe(hash2);
  });

  test('never produces empty or plaintext output', async () => {
    const hash = await hashPassword('AnyPassword!');
    expect(hash).not.toBe('AnyPassword!');
    expect(hash.length).toBeGreaterThan(20);
  });
});

describe('Authentication — token signing', () => {
  let signAccessToken: (id: string, isOwner: boolean, version: number) => string;
  let jwt: typeof import('jsonwebtoken');

  beforeAll(async () => {
    const authModule = await import('../src/modules/auth/auth.service');
    signAccessToken = authModule.signAccessToken;
    jwt = await import('jsonwebtoken');
  });

  test('signed access token contains accountId and tokenVersion', () => {
    const token = signAccessToken('test-account-id', false, 1);
    const secret = process.env['JWT_SECRET']!;
    const decoded = jwt.verify(token, secret) as Record<string, unknown>;
    expect(decoded['sub']).toBe('test-account-id');
    expect(decoded['tokenVersion']).toBe(1);
    expect(decoded['isOwner']).toBe(false);
  });

  test('owner flag is preserved in token', () => {
    const token = signAccessToken('owner-id', true, 0);
    const secret = process.env['JWT_SECRET']!;
    const decoded = jwt.verify(token, secret) as Record<string, unknown>;
    expect(decoded['isOwner']).toBe(true);
  });
});
