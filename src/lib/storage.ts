import {
  STORAGE_KEY_HISTORY_ID,
  STORAGE_KEY_LAST_SYNC,
  STORAGE_KEY_SYNC_STATUS,
} from "./constants";
import type { SyncStatus } from "./types";

/**
 * Chrome storage utilities
 * Uses chrome.storage.local for persistence across service worker restarts
 */

/**
 * Get the stored Gmail history ID for tracking new messages
 */
export async function getStoredHistoryId(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_HISTORY_ID);
  return result[STORAGE_KEY_HISTORY_ID] || null;
}

/**
 * Save the current Gmail history ID
 */
export async function saveHistoryId(historyId: string): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_HISTORY_ID]: historyId,
    [STORAGE_KEY_LAST_SYNC]: Date.now(),
  });
}

/**
 * Get the timestamp of the last sync
 */
export async function getLastSyncTime(): Promise<number | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_LAST_SYNC);
  return result[STORAGE_KEY_LAST_SYNC] || null;
}

/**
 * Set the current sync status
 */
export async function setSyncStatus(status: SyncStatus): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_SYNC_STATUS]: status,
  });
}

/**
 * Get the current sync status
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_STATUS);
  return (result[STORAGE_KEY_SYNC_STATUS] as SyncStatus) || "idle";
}

/**
 * Clear all stored data (for testing or reset)
 */
export async function clearAll(): Promise<void> {
  await chrome.storage.local.clear();
}
