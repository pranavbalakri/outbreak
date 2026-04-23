// Build-time constants baked in from VITE_* env vars. The extension does not
// allow user-provided API origins at runtime — the manifest's host_permissions
// are frozen at build time.
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';
export const WEB_ORIGIN = import.meta.env.VITE_WEB_ORIGIN ?? 'http://localhost:5173';
