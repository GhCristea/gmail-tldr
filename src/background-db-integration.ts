import type { DatabaseMessage, DatabaseResponse, EmailKeyPoint } from './types';

let offscreenCreating = false;

/**
 * Ensure Offscreen document exists (KISS: simple race condition lock)
 */
async function ensureOffscreenDocument(): Promise<void> {
  const offscreenPath = chrome.runtime.getURL('static/offscreen.html');

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenPath]
  });

  if (existingContexts.length > 0) return;

  if (offscreenCreating) {
    while (offscreenCreating) await new Promise(r => setTimeout(r, 50));
    return;
  }

  offscreenCreating = true;
  try {
    await chrome.offscreen.createDocument({
      url: 'static/offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'SQLite persistence for email key-points with privacy controls'
    });
    console.log('[BG] Offscreen document created');
  } catch (err) {
    console.error('[BG] Offscreen creation failed:', err);
  } finally {
    offscreenCreating = false;
  }
}

/**
 * Type-safe wrapper: Send DB command to Offscreen
 */
export async function sendDatabaseCommand<T>(
  message: DatabaseMessage
): Promise<T> {
  await ensureOffscreenDocument();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: DatabaseResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.success) {
        reject(new Error(`[${response?.code ?? 'UNKNOWN'}] ${response?.error ?? 'Unknown error'}`));
      } else {
        resolve(response.data);
      }
    });
  });
}

/**
 * Store email key-point in persistent storage
 */
export async function storeEmailKeyPoint(
  emailId: string,
  subject: string,
  keyPoint: string,
  source: 'wink-nlp' | 'gemini-nano',
  confidence: number,
  tags: string[]
): Promise<void> {
  const kp: EmailKeyPoint = {
    id: crypto.randomUUID(),
    emailId,
    keyPoint,
    extractedAt: Date.now(),
    source,
    confidence,
    tags
  };

  await sendDatabaseCommand({
    action: 'DB_INSERT_KEYPOINT',
    payload: kp
  });

  console.log(`[BG] Stored key-point for email ${emailId}`);
}

/**
 * Query key-points for specific email
 */
export async function queryEmailKeyPoints(emailId: string): Promise<EmailKeyPoint[]> {
  return sendDatabaseCommand({
    action: 'DB_QUERY_KEYPOINTS',
    emailId
  });
}

/**
 * Delete email and associated key-points
 */
export async function deleteEmailData(emailId: string): Promise<number> {
  const result = await sendDatabaseCommand<{ deletedCount: number }>({
    action: 'DB_DELETE_EMAIL',
    emailId
  });
  return result.deletedCount;
}

/**
 * Export all data for user audit
 */
export async function exportData(format: 'json' | 'csv'): Promise<string> {
  return sendDatabaseCommand({
    action: 'DB_EXPORT_DATA',
    format
  });
}

/**
 * Get privacy stats
 */
export async function getDBStats() {
  return sendDatabaseCommand({
    action: 'DB_STATS'
  });
}

/**
 * DANGER: Clear all local data (requires confirmation)
 */
export async function clearAllData(): Promise<void> {
  await sendDatabaseCommand({
    action: 'DB_CLEAR_ALL',
    confirmToken: 'CONFIRM_DELETE_ALL_LOCAL_DATA'
  });
  console.warn('[BG] All local data cleared by user request');
}
