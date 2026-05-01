// Dev-only: mints a session JWT for the seeded admin (or a given user id)
// so you can exercise authed endpoints without going through Google.
// Usage: pnpm --filter @breaklog/api tsx scripts/mint-dev-session.ts [userId]
import { SignJWT } from 'jose';
import { prisma } from '../src/db.js';
import { loadEnv } from '../src/env.js';

async function main() {
  const env = loadEnv();
  const arg = process.argv[2];
  const user = arg
    ? await prisma.user.findUnique({ where: { id: arg } })
    : await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  if (!user) {
    console.error('No user found');
    process.exit(1);
  }

  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);

  process.stdout.write(token);
  await prisma.$disconnect();
}

void main();
