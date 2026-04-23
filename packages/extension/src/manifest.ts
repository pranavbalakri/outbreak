import { defineManifest } from '@crxjs/vite-plugin';

// Host permissions are populated at build time from VITE_API_ORIGIN so local
// dev, staging, and prod builds each target their own origin and nothing more.
const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

export default defineManifest({
  manifest_version: 3,
  name: 'Outbreak',
  version: '0.1.0',
  description: 'Track debate-coaching research time without leaving your browser.',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Outbreak',
  },
  background: {
    service_worker: 'src/service-worker/index.ts',
    type: 'module',
  },
  // `idle` is intentionally absent — idle detection is out of scope per spec §4.2.
  // `identity` powers chrome.identity.launchWebAuthFlow + getRedirectURL,
  // which the popup uses to kick off Google OAuth via the web app.
  permissions: ['storage', 'alarms', 'notifications', 'activeTab', 'identity'],
  host_permissions: [`${apiOrigin}/*`],
  commands: {
    'toggle-timer': {
      suggested_key: {
        default: 'Ctrl+Shift+O',
        mac: 'Command+Shift+O',
      },
      description: 'Start or stop the Outbreak timer for the most recent project.',
    },
  },
  icons: {
    '16': 'src/icons/icon16.png',
    '48': 'src/icons/icon48.png',
    '128': 'src/icons/icon128.png',
  },
});
