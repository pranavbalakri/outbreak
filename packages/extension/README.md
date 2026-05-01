# Breaklog — Chrome extension

Manifest V3 extension that gives instructors a one-click timer next to the
browser toolbar. Same backend as the web app, authenticated via a long-lived
bearer token minted after a normal Google sign-in.

## Layout

- `src/manifest.ts` — MV3 manifest (permissions: `storage`, `alarms`,
  `notifications`, `activeTab`; host permissions for the API origin only).
- `src/popup/` — React UI shown when the toolbar icon is clicked.
- `src/service-worker/` — background logic: badge updates, keyboard shortcut,
  offline polling.
- `src/lib/` — shared API client, storage helpers, build-time config.

## Load unpacked (dev)

```bash
pnpm install
pnpm --filter @breaklog/extension dev
```

`vite` writes an unpacked dev bundle to `dist/`. In Chrome:

1. Visit `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and pick `packages/extension/dist`.

You'll also need the API and web app running locally:

```bash
pnpm --filter @breaklog/api dev   # :4000
pnpm --filter @breaklog/web dev   # :5173
```

Set `VITE_API_ORIGIN` and `VITE_WEB_ORIGIN` if either runs on non-default ports.
The manifest's `host_permissions` is baked at build time from `VITE_API_ORIGIN`,
so changing origins means rebuilding.

## Sign in

The popup's "Sign in with Google" button runs
`chrome.identity.launchWebAuthFlow` pointed at the web app's
`/extension/connect` route. That page mints an `ApiToken` (via
`POST /auth/extension-token`) and redirects back to the extension with
`#token=...` in the URL fragment. The extension stores the token in
`chrome.storage.local`.

Revoke a device from **Web app → Settings → Connected Devices**. Revocation
takes effect on the next API call.

## Keyboard shortcut

Default: **Ctrl+Shift+O** (Windows/Linux) or **Command+Shift+O** (macOS).

- If a timer is running, it stops.
- Else, starts a timer against the most recently used project (including
  "general time" if that was the last choice).
- If no MRU yet, opens the popup instead.

Change the shortcut at `chrome://extensions/shortcuts`.

## Ship a release (Chrome Web Store, private listing)

```bash
pnpm --filter @breaklog/extension build
# → packages/extension/dist/extension.zip
```

1. Go to the Chrome Web Store [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Click **New Item** → upload `extension.zip`.
3. On the item's **Distribution** page pick **Unlisted**.
4. Submit for review. Once approved, share the install link with Vik and
   instructors — it auto-updates the same way a public extension does.

## What this extension explicitly does NOT do

Per spec §4.2, none of these are implemented — nor are they welcome later
without revisiting the spec:

- Automatic time tracking based on the active tab.
- Idle detection.
- Content-script injection or DOM reading (only `chrome.tabs` title/URL).
- Offline queueing (v2 candidate; current behavior is "disable controls when
  offline").
