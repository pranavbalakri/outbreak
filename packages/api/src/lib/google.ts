import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { loadEnv } from '../env.js';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function generateState(): string {
  return base64url(randomBytes(24));
}

export interface GoogleIdClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string | undefined;
  picture?: string | undefined;
}

export function buildAuthUrl(args: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  mode?: 'web' | 'extension';
}): string {
  const env = loadEnv();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: args.redirectUri,
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(args: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ idToken: string }> {
  const env = loadEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code: args.code,
    code_verifier: args.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: args.redirectUri,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error('Google response missing id_token');
  return { idToken: json.id_token };
}

export async function verifyIdToken(idToken: string): Promise<GoogleIdClaims> {
  const env = loadEnv();
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: [GOOGLE_ISSUER, 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  });

  if (typeof payload.sub !== 'string') throw new Error('id_token missing sub');
  const email = payload['email'];
  if (typeof email !== 'string') throw new Error('id_token missing email');
  const emailVerified = payload['email_verified'];
  const name = payload['name'];
  const picture = payload['picture'];

  return {
    sub: payload.sub,
    email,
    emailVerified: emailVerified === true,
    name: typeof name === 'string' ? name : undefined,
    picture: typeof picture === 'string' ? picture : undefined,
  };
}
