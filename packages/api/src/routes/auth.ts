import type { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { loadEnv } from '../env.js';
import { SESSION_CONFIG, signSession } from '../lib/session.js';
import { authenticate } from '../lib/auth.js';
import {
  buildAuthUrl,
  exchangeCode,
  generatePkcePair,
  generateState,
  verifyIdToken,
} from '../lib/google.js';
import { BadRequest, Forbidden } from '../errors.js';
import { toUserDto } from '../lib/dto.js';

const OAUTH_STATE_COOKIE = 'breaklog_oauth_state';
const OAUTH_MAX_AGE_SEC = 10 * 60; // 10 minutes

async function recordAttempt(input: {
  email?: string | null;
  ip?: string | null;
  success: boolean;
  reason: string;
  userId?: string | null;
}): Promise<void> {
  try {
    await prisma.authAttempt.create({
      data: {
        email: input.email ?? null,
        ip: input.ip ?? null,
        success: input.success,
        reason: input.reason,
        userId: input.userId ?? null,
      },
    });
  } catch {
    // Auth-attempt logging must never block the user flow.
  }
}

interface OAuthStateCookie {
  state: string;
  verifier: string;
  iat: number;
  redirectAfter?: string;
}

function setOAuthStateCookie(
  reply: import('fastify').FastifyReply,
  payload: OAuthStateCookie,
): void {
  const env = loadEnv();
  reply.setCookie(OAUTH_STATE_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    signed: true,
    // Path '/' — the callback is served from /auth/... direct to the API, or
    // /api/auth/... when proxied through Vercel. A root path covers both.
    path: '/',
    maxAge: OAUTH_MAX_AGE_SEC,
  });
}

function readOAuthStateCookie(
  request: import('fastify').FastifyRequest,
): OAuthStateCookie | null {
  const raw = request.cookies[OAUTH_STATE_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;
  try {
    return JSON.parse(unsigned.value) as OAuthStateCookie;
  } catch {
    return null;
  }
}

function callbackRedirectUri(): string {
  const env = loadEnv();
  if (env.OAUTH_CALLBACK_URL) return env.OAUTH_CALLBACK_URL;
  return `${env.API_ORIGIN}/auth/google/callback`;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();

  app.get<{ Querystring: { redirect?: string } }>(
    '/auth/google/start',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        throw BadRequest('google_not_configured', 'Google OAuth client is not configured');
      }

      const { verifier, challenge } = generatePkcePair();
      const state = generateState();
      const redirectAfter = request.query.redirect?.startsWith('/')
        ? request.query.redirect
        : '/';

      setOAuthStateCookie(reply, {
        state,
        verifier,
        iat: Math.floor(Date.now() / 1000),
        redirectAfter,
      });

      const url = buildAuthUrl({
        state,
        codeChallenge: challenge,
        redirectUri: callbackRedirectUri(),
      });
      return reply.redirect(url);
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/google/callback',
    {
      config: {
        // Per-IP — handful of retries is normal after a race, spamming is not.
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const ip = request.ip;
      const { code, state, error } = request.query;

      if (error) {
        await recordAttempt({ ip, success: false, reason: `google_oauth_error:${error}` });
        throw BadRequest('google_oauth_error', `Google returned error: ${error}`);
      }
      if (!code || !state) {
        await recordAttempt({ ip, success: false, reason: 'missing_params' });
        throw BadRequest('missing_params', 'Missing code or state');
      }

      const cookie = readOAuthStateCookie(request);
      if (!cookie) {
        await recordAttempt({ ip, success: false, reason: 'missing_state_cookie' });
        throw BadRequest('missing_state_cookie', 'OAuth state cookie missing');
      }
      if (cookie.state !== state) {
        await recordAttempt({ ip, success: false, reason: 'state_mismatch' });
        throw BadRequest('state_mismatch', 'OAuth state mismatch');
      }

      // Replay guard: even if the cookie somehow survived past its maxAge, enforce iat.
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec - cookie.iat > OAUTH_MAX_AGE_SEC) {
        reply.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
        await recordAttempt({ ip, success: false, reason: 'state_expired' });
        throw BadRequest('state_expired', 'OAuth state expired — please sign in again');
      }

      // Always clear the state cookie — single-use.
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

      let claims;
      try {
        const { idToken } = await exchangeCode({
          code,
          codeVerifier: cookie.verifier,
          redirectUri: callbackRedirectUri(),
        });
        claims = await verifyIdToken(idToken);
      } catch (err) {
        await recordAttempt({ ip, success: false, reason: 'token_exchange_failed' });
        throw err;
      }

      if (!claims.emailVerified) {
        await recordAttempt({
          ip,
          email: claims.email,
          success: false,
          reason: 'email_not_verified',
        });
        throw Forbidden(
          'Your Google email is not verified. Please verify it with Google and try again.',
          'email_not_verified',
        );
      }

      // 1) match by google_sub
      let user = await prisma.user.findUnique({ where: { googleSub: claims.sub } });

      // 2) else match by email for a user that hasn't been bound yet
      if (!user) {
        const byEmail = await prisma.user.findUnique({
          where: { email: claims.email.toLowerCase() },
        });
        if (byEmail && !byEmail.googleSub) {
          user = await prisma.user.update({
            where: { id: byEmail.id },
            data: {
              googleSub: claims.sub,
              avatarUrl: claims.picture ?? byEmail.avatarUrl,
              name: byEmail.name || claims.name || byEmail.email,
            },
          });
        } else if (byEmail && byEmail.googleSub && byEmail.googleSub !== claims.sub) {
          await recordAttempt({
            ip,
            email: claims.email,
            userId: byEmail.id,
            success: false,
            reason: 'email_bound_to_different_account',
          });
          throw Forbidden(
            'This email is already linked to a different Google account',
            'email_bound_to_different_account',
          );
        }
      }

      if (!user) {
        await recordAttempt({ ip, email: claims.email, success: false, reason: 'unknown_user' });
        throw Forbidden(
          'Your Google account is not authorized for Breaklog. Contact your admin.',
          'unknown_user',
        );
      }
      if (user.deletedAt || !user.isActive) {
        await recordAttempt({
          ip,
          email: claims.email,
          userId: user.id,
          success: false,
          reason: 'account_inactive',
        });
        throw Forbidden('Account is deactivated. Contact your admin.', 'account_inactive');
      }

      // Keep avatar fresh.
      if (claims.picture && claims.picture !== user.avatarUrl) {
        await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: claims.picture },
        });
      }

      const session = await signSession({ sub: user.id, role: user.role });
      const isProd = env.NODE_ENV === 'production';
      reply.setCookie(SESSION_CONFIG.cookieName, session, {
        httpOnly: true,
        secure: isProd,
        // In prod the API and web live on different registrable domains
        // (fly.dev vs. vercel.app), so the session cookie is cross-site.
        // SameSite=None (with Secure) is the only combo browsers will send.
        sameSite: isProd ? 'none' : 'lax',
        signed: false,
        path: '/',
        maxAge: SESSION_CONFIG.ttlSeconds,
      });

      await recordAttempt({
        ip,
        email: claims.email,
        userId: user.id,
        success: true,
        reason: 'success',
      });

      const target = cookie.redirectAfter ?? '/';
      return reply.redirect(`${env.WEB_ORIGIN}${target}`);
    },
  );

  app.post('/auth/logout', async (_request, reply) => {
    const env = loadEnv();
    const isProd = env.NODE_ENV === 'production';
    reply.clearCookie(SESSION_CONFIG.cookieName, {
      path: '/',
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    });
    return { ok: true };
  });

  app.get('/auth/me', async (request) => {
    const user = await authenticate(request);
    return { user: toUserDto(user) };
  });

  // Mint an ApiToken for the current session. Used by the Chrome extension's
  // connect flow: the user signs in to the web app normally, then this returns
  // a long-lived bearer token the extension stores in chrome.storage.local.
  // The plaintext token is returned only once — only its SHA-256 is persisted.
  const MintTokenBody = z.object({
    label: z.string().min(1).max(200).optional(),
    source: z.string().min(1).max(32).default('extension'),
  });
  app.post('/auth/extension-token', async (request) => {
    const user = await authenticate(request);
    const { label, source } = MintTokenBody.parse(request.body ?? {});

    // 32 random bytes, base64url. 256 bits is plenty; breaklog_ prefix makes leaks self-identifying.
    const raw = `breaklog_${randomBytes(32).toString('base64url')}`;
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const stored = await prisma.apiToken.create({
      data: {
        userId: user.id,
        tokenHash,
        label: label ?? null,
        source,
      },
    });

    return {
      token: raw,
      apiToken: {
        id: stored.id,
        label: stored.label,
        source: stored.source,
        createdAt: stored.createdAt.toISOString(),
      },
    };
  });
}
