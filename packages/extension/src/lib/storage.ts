// Typed wrapper over chrome.storage.local. Keeps popup and service worker in
// sync — `chrome.storage.onChanged` fires in both contexts.

export interface ExtensionStorage {
  token?: string;
  userName?: string;
  userEmail?: string;
  mruProjectId?: string | null; // null = "general time" was last used
  mruProjectName?: string | null;
  lastOnline?: number; // epoch ms of last successful API ping
}

export async function readStorage<K extends keyof ExtensionStorage>(
  ...keys: K[]
): Promise<Pick<ExtensionStorage, K>> {
  const query = keys.length === 0 ? null : [...keys];
  const raw = await chrome.storage.local.get(query as never);
  return raw as Pick<ExtensionStorage, K>;
}

export async function writeStorage(patch: Partial<ExtensionStorage>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(['token', 'userName', 'userEmail']);
}
