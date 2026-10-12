import { constants, verify as verifySignature, type KeyObject } from 'node:crypto';

import type { EnterpriseVerifiedOidcPrincipalV1 } from '@freehighlander/contracts';
import { EnterpriseDirectoryStateStore } from '@freehighlander/persistence';

import type { TrustedEnterpriseOidcVerifier } from './enterprise-oidc-session-issuer.js';

/**
 * Signing keys are loaded from the operator's independently trusted OIDC
 * provider configuration, never from JWT headers or client-controlled URLs.
 * JWKS HTTPS discovery/refresh and login-flow replay protections are separate.
 */
export interface PinnedOidcRs256Key {
  readonly kid: string;
  readonly publicKey: KeyObject;
}

export interface PinnedOidcRs256VerifierOptions {
  readonly directory: EnterpriseDirectoryStateStore;
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  /** Trusted server-side, per-login OIDC nonce. Never take this from JWT claims. */
  readonly expectedNonce: string;
  readonly keys: readonly PinnedOidcRs256Key[];
  readonly now: () => string;
}

const MAX_TOKEN_BYTES = 16 * 1024;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_UNIX_SECONDS = 8_640_000_000_000;

function fail(): never {
  // Do not disclose token contents, claim values, key material or secrets.
  throw new Error('OIDC ID token verification failed');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decode(segment: string): Buffer {
  if (!BASE64URL.test(segment)) return fail();
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.toString('base64url') !== segment) return fail();
  return bytes;
}

function parsedObject(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(decode(segment).toString('utf8'));
  if (!isRecord(value)) return fail();
  return value;
}

function timestampSeconds(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_UNIX_SECONDS
  ) {
    return fail();
  }
  return value;
}

/**
 * RS256 ID-token cryptographic verifier with pinned, trusted public keys.
 * This class does NOT fetch arbitrary URLs, authenticate the browser, or
 * consume/rotate OIDC state and nonce. Each verifier must be constructed for
 * the particular server-held login transaction and destroyed afterward.
 */
export class PinnedOidcRs256Verifier implements TrustedEnterpriseOidcVerifier {
  readonly #keys: ReadonlyMap<string, KeyObject>;

  constructor(readonly options: PinnedOidcRs256VerifierOptions) {
    const issuer = new URL(options.expectedIssuer);
    if (
      issuer.protocol !== 'https:' ||
      issuer.username !== '' ||
      issuer.password !== '' ||
      issuer.search !== '' ||
      issuer.hash !== ''
    ) {
      throw new Error('OIDC issuer must be trusted HTTPS URL');
    }
    if (!options.expectedAudience || options.expectedAudience.trim() !== options.expectedAudience) {
      throw new Error('OIDC audience must be configured');
    }
    if (
      typeof options.expectedNonce !== 'string' ||
      options.expectedNonce.length < 16 ||
      options.expectedNonce.length > 256
    ) {
      throw new Error('OIDC nonce must come from a trusted login transaction');
    }
    if (typeof options.now !== 'function') throw new Error('trusted clock is required');
    if (!Array.isArray(options.keys) || options.keys.length === 0) {
      throw new Error('trusted OIDC signing keys are required');
    }

    const keys = new Map<string, KeyObject>();
    for (const candidate of options.keys) {
      if (
        !candidate ||
        typeof candidate.kid !== 'string' ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(candidate.kid) ||
        keys.has(candidate.kid)
      ) {
        throw new Error('trusted OIDC key ids must be unique and bounded');
      }
      const key = candidate.publicKey;
      if (
        !key ||
        key.type !== 'public' ||
        key.asymmetricKeyType !== 'rsa' ||
        (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
      ) {
        throw new Error('trusted OIDC keys must be RSA public keys of at least 2048 bits');
      }
      keys.set(candidate.kid, key);
    }
    this.#keys = keys;
  }

  async verifyIdToken(rawIdToken: string): Promise<EnterpriseVerifiedOidcPrincipalV1> {
    try {
      return this.#verify(rawIdToken);
    } catch {
      return fail();
    }
  }

  #verify(token: string): EnterpriseVerifiedOidcPrincipalV1 {
    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES
    ) {
      return fail();
    }
    const parts = token.split('.');
    if (parts.length !== 3) return fail();
    const [encodedHeader, encodedClaims, encodedSignature] = parts;
    const header = parsedObject(encodedHeader);
    if (
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      (header.typ !== undefined && header.typ !== 'JWT') ||
      'jku' in header ||
      'x5u' in header ||
      'jwk' in header ||
      'crit' in header
    ) {
      return fail();
    }
    const key = this.#keys.get(header.kid);
    if (!key) return fail();
    const validSignature = verifySignature(
      'RSA-SHA256',
      Buffer.from(encodedHeader + '.' + encodedClaims, 'ascii'),
      { key, padding: constants.RSA_PKCS1_PADDING },
      decode(encodedSignature),
    );
    if (!validSignature) return fail();

    const claims = parsedObject(encodedClaims);
    if (
      claims.iss !== this.options.expectedIssuer ||
      claims.aud !== this.options.expectedAudience ||
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0 ||
      claims.sub.length > 255 ||
      claims.nonce !== this.options.expectedNonce
    ) {
      return fail();
    }
    const issuedAt = timestampSeconds(claims.iat);
    const expiresAt = timestampSeconds(claims.exp);
    const notBefore = claims.nbf === undefined ? null : timestampSeconds(claims.nbf);
    const nowMs = Date.parse(this.options.now());
    if (
      !Number.isFinite(nowMs) ||
      issuedAt * 1000 > nowMs ||
      expiresAt * 1000 <= nowMs ||
      expiresAt <= issuedAt ||
      (notBefore !== null && notBefore * 1000 > nowMs)
    ) {
      return fail();
    }

    // Derive actor identity ONLY from the durable server-owned binding. The
    // token's own actorId or custom role claims must never determine access.
    const snapshot = this.options.directory.read();
    const matching = snapshot.state.oidcBindings.filter(
      (entry) =>
        entry.issuer === claims.iss &&
        entry.audience === claims.aud &&
        entry.subject === claims.sub,
    );
    if (matching.length !== 1) return fail();
    const actor = snapshot.state.actors.find((item) => item.actorId === matching[0].actorId);
    if (!actor || actor.kind !== 'OIDC_USER' || actor.status !== 'ACTIVE') return fail();

    return {
      schemaVersion: 1,
      actorId: actor.actorId,
      issuer: this.options.expectedIssuer,
      audience: this.options.expectedAudience,
      subject: claims.sub,
      issuedAt: new Date(issuedAt * 1000).toISOString(),
      notBefore: notBefore === null ? null : new Date(notBefore * 1000).toISOString(),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      verificationSource: 'TRUSTED_CONTROL_PLANE_VERIFIER',
      signatureVerified: true,
      rawTokenPresent: false,
      authority: 'NONE',
    };
  }
}

export function pinnedOidcVerifierCanGrantAuthority(): false {
  return false;
}

export function pinnedOidcVerifierCanTrustTokenProvidedKeys(): false {
  return false;
}
