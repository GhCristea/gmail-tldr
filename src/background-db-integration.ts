import type {
  DatabaseMessage,
  DatabaseResponse,
} from './types/messages';
import type {
  EmailMetadata,
  RecentSummariesResult,
} from './types/db';

const OFFSCREEN_URL = chrome.runtime.getURL('static/offscreen.html');

let offscreenCreation: Promise<void> | null = null;

async function ensureOffscreenReady(): Promise<void> {
  if (offscreenCreation) {
    return offscreenCreation;
  }

  offscreenCreation = (async () => {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [OFFSCREEN_URL],
      });

      if (contexts.length > 0) return;

      try {
        await chrome.offscreen.createDocument({
          url: 'static/offscreen.html',
          reasons: [chrome.offscreen.Reason.WORKERS],
          justification:
            'Wink NLP preprocessing and local SQLite storage for Gmail summaries',
        });
        return;
      } catch (err) {
        if (attempt === maxAttempts - 1) throw err;
        const backoffMs = 200 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  })().finally(() => {
    offscreenCreation = null;
  });

  return offscreenCreation;
}

async function sendDbCommand<T>(
  message: DatabaseMessage,
): Promise<T> {
  await ensureOffscreenReady();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: DatabaseResponse<T>) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!response) {
        return reject(new Error('No response from DB offscreen daemon'));
      }
      if (!response.success) {
        return reject(new Error(response.error));
      }
      resolve(response.data);
    });
  });
}

// High-level DB API

export async function queueEmailMetadata(
  meta: EmailMetadata,
): Promise<void> {
  await sendDbCommand<null>({
    type: 'DB/QUEUE_EMAIL_METADATA',
    payload: meta,
  });
}

export async function storeEmailSummary(params: {
  messageId: string;
  summary: string;
  labels: string[];
  tokensUsed: number;
}): Promise<void> {
  await sendDbCommand<null>({
    type: 'DB/STORE_SUMMARY',
    payload: {
      messageId: params.messageId,
      summary: params.summary,
      labels: params.labels,
      tokensUsed: params.tokensUsed,
      processedAt: Date.now(),
    },
  });
}

export async function listRecentSummaries(
  limit = 20,
): Promise<RecentSummariesResult> {
  return sendDbCommand<RecentSummariesResult>({
    type: 'DB/LIST_RECENT_SUMMARIES',
    payload: { limit },
  });
}

export async function clearAllData(): Promise<void> {
  await sendDbCommand<null>({ type: 'DB/CLEAR_ALL_DATA' });
}

export async function pingDb(): Promise<boolean> {
  try {
    const res = await sendDbCommand<{ ok: boolean }>({
      type: 'DB/PING',
    });
    return !!res.ok;
  } catch {
    return false;
  }
}

export { ensureOffscreenReady };
