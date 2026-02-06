import {
  STORAGE_KEY_HISTORY_ID,
  STORAGE_KEY_LAST_SYNC,
  STORAGE_KEY_SYNC_STATUS,
} from "./constants.js";
import type { SyncStatus } from "./types.js";

export async function getStoredHistoryId(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_HISTORY_ID);
  return (result[STORAGE_KEY_HISTORY_ID] as string) || null;
}

export async function saveHistoryId(historyId: string): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_HISTORY_ID]: historyId,
    [STORAGE_KEY_LAST_SYNC]: Date.now(),
  });
}

export async function getLastSyncTime(): Promise<number | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_LAST_SYNC);
  return (result[STORAGE_KEY_LAST_SYNC] as number) || null;
}

export async function setSyncStatus(status: SyncStatus): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_SYNC_STATUS]: status,
  });
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_STATUS);
  return (result[STORAGE_KEY_SYNC_STATUS] as SyncStatus) || "idle";
}

export async function clearAll(): Promise<void> {
  await chrome.storage.local.clear();
}
