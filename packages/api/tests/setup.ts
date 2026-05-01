// Load test env before anything imports env.ts or db.ts.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-test-test-test-test-test-test-test-test-test';
process.env.DATABASE_URL ??=
  'postgresql://breaklog:breaklog@localhost:5433/breaklog_test?schema=public';
process.env.API_ORIGIN ??= 'http://localhost:4000';
process.env.WEB_ORIGIN ??= 'http://localhost:5173';
process.env.GOOGLE_CLIENT_ID ??= 'test-client';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-secret';
