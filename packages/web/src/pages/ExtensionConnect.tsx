import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { api, apiOrigin } from '../api/client.js';
import { Card } from '../components/ui.js';

// `/extension/connect?redirect=<extension-redirect-url>` — the Chrome extension
// sends its user here via `chrome.identity.launchWebAuthFlow`. If the user is
// signed in we mint a bearer token and redirect back to the extension with
// the token in the URL fragment (never a query string — fragments aren't sent
// to servers and don't land in referrer headers). If they aren't signed in,
// we bounce through the standard Google flow with this page as the returnTo.
export function ExtensionConnectPage() {
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') ?? '';

  useEffect(() => {
    if (loading || attempted.current) return;

    if (!redirect || !/^https:\/\/[a-z]+\.chromiumapp\.org\/?/.test(redirect)) {
      setError('Missing or invalid redirect parameter.');
      return;
    }

    if (!user) {
      // Kick over to Google auth; come back here afterwards.
      const returnTo = `/extension/connect?redirect=${encodeURIComponent(redirect)}`;
      window.location.replace(
        `${apiOrigin()}/auth/google/start?redirect=${encodeURIComponent(returnTo)}`,
      );
      return;
    }

    attempted.current = true;
    (async () => {
      try {
        const { token } = await api<{ token: string }>('/auth/extension-token', {
          method: 'POST',
          body: JSON.stringify({
            label: navigator.userAgent.slice(0, 200),
            source: 'extension',
          }),
        });
        const target = new URL(redirect);
        target.hash = `token=${encodeURIComponent(token)}`;
        window.location.replace(target.toString());
      } catch (err) {
        setError(`Failed to mint extension token: ${(err as Error).message}`);
      }
    })();
  }, [loading, user, redirect]);

  return (
    <div className="mx-auto mt-24 max-w-md">
      <Card className="p-6 text-center text-sm text-slate-600">
        {error ? (
          <div className="text-red-600">{error}</div>
        ) : (
          <div>Connecting the Outbreak extension…</div>
        )}
      </Card>
    </div>
  );
}
