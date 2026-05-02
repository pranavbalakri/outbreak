// Build-time constants baked in from VITE_* env vars. The extension does not
// allow user-provided API origins at runtime — the manifest's host_permissions
// are frozen at build time.
//
// Production builds (`MODE === 'production'`) MUST set both env vars, otherwise
// the published extension would point sign-in at localhost and chrome.identity
// would fail with "Authorization page could not be loaded." Failing the build
// is much better than shipping a broken zip.
const rawApiOrigin = import.meta.env.VITE_API_ORIGIN;
const rawWebOrigin = import.meta.env.VITE_WEB_ORIGIN;

if (import.meta.env.MODE === 'production') {
  if (!rawApiOrigin || rawApiOrigin.startsWith('http://localhost')) {
    throw new Error(
      'VITE_API_ORIGIN must be set to a non-localhost URL for production builds.',
    );
  }
  if (!rawWebOrigin || rawWebOrigin.startsWith('http://localhost')) {
    throw new Error(
      'VITE_WEB_ORIGIN must be set to a non-localhost URL for production builds.',
    );
  }
}

export const API_ORIGIN = rawApiOrigin ?? 'http://localhost:4000';
export const WEB_ORIGIN = rawWebOrigin ?? 'http://localhost:5173';
