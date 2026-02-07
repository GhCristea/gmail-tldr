import {
  STORAGE_KEY_EMAILS,
  STORAGE_KEY_HISTORY_ID,
  STORAGE_KEY_LAST_SYNC,
  STORAGE_KEY_SYNC_STATUS
} from './constants.js'
import type { EmailSummary, SyncStatus } from './types.js'

export async function getStoredHistoryId() {
  const result = await chrome.storage.local.get(STORAGE_KEY_HISTORY_ID)
  return (result[STORAGE_KEY_HISTORY_ID] as string) || null
}

export async function saveHistoryId(historyId: string) {
  await chrome.storage.local.set({ [STORAGE_KEY_HISTORY_ID]: historyId, [STORAGE_KEY_LAST_SYNC]: Date.now() })
}

export async function getLastSyncTime() {
  const result = await chrome.storage.local.get(STORAGE_KEY_LAST_SYNC)
  return (result[STORAGE_KEY_LAST_SYNC] as number) || null
}

export async function setSyncStatus(status: SyncStatus) {
  await chrome.storage.local.set({ [STORAGE_KEY_SYNC_STATUS]: status })
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_STATUS)
  return (result[STORAGE_KEY_SYNC_STATUS] as SyncStatus) || 'idle'
}

export async function getStoredEmails(): Promise<EmailSummary[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY_EMAILS)
  return (result[STORAGE_KEY_EMAILS] as EmailSummary[]) || []
}

export async function saveStoredEmails(emails: EmailSummary[]) {
  await chrome.storage.local.set({ [STORAGE_KEY_EMAILS]: emails })
}

export async function appendNewEmails(newEmails: EmailSummary[]) {
  const current = await getStoredEmails()
  const updated = [...current, ...newEmails].slice(-50)
  await saveStoredEmails(updated)
}

export async function clearAll() {
  await chrome.storage.local.clear()
}
