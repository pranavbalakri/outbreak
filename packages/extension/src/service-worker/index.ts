/// <reference types="chrome" />

// Breaklog service worker.
// Responsibilities:
//   - Poll /timer/current every ~10s and keep the toolbar badge honest.
//   - Handle the toggle-timer keyboard command (Step 33).
//   - Track online/offline so the popup can render the right state (Step 34).
// MV3 service workers are ephemeral: never rely on in-memory state surviving a
// wake. Persist to chrome.storage.local.

import type { ProjectDto, TimeEntryDto } from '@breaklog/shared';
import { API_ORIGIN } from '../lib/config.js';

const TICK_ALARM = 'breaklog-tick';
const TICK_PERIOD_MINUTES = 10 / 60; // every 10s

const BADGE_COLOR_RUNNING = '#10b981'; // green
const BADGE_COLOR_IDLE = '#64748b'; // slate
const BADGE_COLOR_OFFLINE = '#dc2626'; // red

async function getToken(): Promise<string | null> {
  const { token } = await chrome.storage.local.get('token');
  return typeof token === 'string' ? token : null;
}

async function apiGet<T>(path: string): Promise<T | { __offline: true }> {
  const token = await getToken();
  if (!token) throw new Error('no_token');
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await chrome.storage.local.set({ lastOnline: Date.now() });
    return (await res.json()) as T;
  } catch {
    return { __offline: true };
  }
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('no_token');
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await chrome.storage.local.set({ lastOnline: Date.now() });
  return (await res.json()) as T;
}

function fmtBadge(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const s = seconds % 60;
    return `${minutes}:${String(s).padStart(2, '0')}`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

async function refreshBadge(): Promise<void> {
  const token = await getToken();
  if (!token) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const result = await apiGet<{ entry: TimeEntryDto | null }>('/timer/current');
  if ('__offline' in result) {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_OFFLINE });
    await chrome.action.setBadgeText({ text: '!' });
    return;
  }

  if (result.entry && !result.entry.endedAt) {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_RUNNING });
    await chrome.action.setBadgeText({ text: fmtBadge(result.entry.startedAt) });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_IDLE });
    await chrome.action.setBadgeText({ text: '' });
  }
}

async function ensureTickAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(TICK_ALARM);
  if (!existing) {
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_PERIOD_MINUTES });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureTickAlarm();
  void refreshBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureTickAlarm();
  void refreshBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) void refreshBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // Token changes (sign-in / sign-out) or MRU updates should repaint the badge.
  if ('token' in changes || 'mruProjectId' in changes) void refreshBadge();
});

// ---- Keyboard shortcut (Step 33) ----
//
// Toggle the timer for the most recently used project. If nothing has been used
// yet, open the popup so the user can pick. Projects are re-fetched on each
// press so an extension that's been asleep for hours doesn't start against a
// stale project name the user no longer has access to.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-timer') return;
  try {
    const token = await getToken();
    if (!token) {
      await chrome.action.openPopup();
      return;
    }

    const current = await apiGet<{ entry: TimeEntryDto | null }>('/timer/current');
    if ('__offline' in current) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_OFFLINE });
      await chrome.action.setBadgeText({ text: '!' });
      return;
    }

    if (current.entry && !current.entry.endedAt) {
      await apiPost('/timer/stop', {});
      await refreshBadge();
      return;
    }

    const { mruProjectId, mruProjectName } = await chrome.storage.local.get([
      'mruProjectId',
      'mruProjectName',
    ]);

    // `undefined` means "never picked anything" — open the popup so the user
    // can make a first choice. `null` is a valid MRU meaning "general time".
    if (mruProjectId === undefined) {
      await chrome.action.openPopup();
      return;
    }

    // Sanity-check the project still exists and is assigned to the user.
    if (mruProjectId !== null) {
      const projects = await apiGet<{ projects: ProjectDto[] }>('/projects');
      if ('__offline' in projects) return;
      const stillAssigned = projects.projects.some((p) => p.id === mruProjectId);
      if (!stillAssigned) {
        await chrome.storage.local.remove(['mruProjectId', 'mruProjectName']);
        await chrome.action.openPopup();
        return;
      }
    }

    // Best-effort active-tab note for the entry description.
    let description: string | undefined;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) description = tab.title ? `${tab.title} — ${tab.url}` : tab.url;
    } catch {
      /* activeTab may not be available — not fatal */
    }

    await apiPost('/timer/start', {
      source: 'EXTENSION',
      projectId: mruProjectId,
      ...(description ? { description } : {}),
    });
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('src/icons/icon48.png'),
      title: 'Breaklog — timer started',
      message: mruProjectId ? String(mruProjectName ?? 'Project') : 'General time',
    });
    await refreshBadge();
  } catch (err) {
    console.error('toggle-timer failed', err);
  }
});

// Initial paint the first time the worker spins up after install.
void ensureTickAlarm();
void refreshBadge();
