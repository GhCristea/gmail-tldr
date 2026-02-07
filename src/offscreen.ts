import {
  OFFSCREEN,
  SERVICE_WORKER,
  PROCESS_EMAIL,
  PROCESSED_EMAIL_RESULT,
} from './lib/constants';
import { listenForMessages } from './lib/messaging';
import { logger } from './lib/logger';
import { preprocessEmailForLLM } from './lib/nlp/preprocess';
import { handleDatabaseMessage, isDbMessage } from './lib/db';
import type { DatabaseMessage, DatabaseResponse } from './types/messages';

logger.log('[Offscreen] Document initialized');

/**
 * 1) Wink NLP daemon for PROCESS_EMAIL (preserves existing API)
 */
listenForMessages<typeof SERVICE_WORKER, typeof OFFSCREEN>(
  (message, _sender, sendResponse) => {
    if (message.type === PROCESS_EMAIL && message.data) {
      void processEmail(message.data.id, message.data.text, sendResponse);
      return true; // async
    }
  },
);

function processEmail(
  id: string,
  text: string,
  sendResponse: (response?: unknown) => void,
) {
  logger.log(`[Offscreen] Processing email ${id}...`);

  try {
    const { email_text_filtered, email_labels, droppedSpans } =
      preprocessEmailForLLM(text);

    const result = {
      id,
      tokens: email_text_filtered.split(/\s+/),
      entities: email_labels,
      pos: droppedSpans.map(s => s.type),
    };

    sendResponse({ type: PROCESSED_EMAIL_RESULT, data: result });
    logger.log(`[Offscreen] Email ${id} processed`);
  } catch (error) {
    logger.error(`[Offscreen] Error processing email ${id}:`, error);
    sendResponse({
      type: PROCESSED_EMAIL_RESULT,
      data: null,
      error: String(error),
    });
  }
}

/**
 * 2) DB command handler (SQLite)
 */
chrome.runtime.onMessage.addListener(
  (rawMessage: unknown, _sender, sendResponse) => {
    if (!isDbMessage(rawMessage)) {
      return; // not a DB command; let other listeners handle it
    }

    const message = rawMessage as DatabaseMessage;

    (async () => {
      const response: DatabaseResponse<unknown> =
        await handleDatabaseMessage(message);
      sendResponse(response);
    })().catch(err => {
      logger.error('[Offscreen] Unhandled DB error', err);
      const fallback: DatabaseResponse<null> = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'OFFSCREEN_DB_ERROR',
      };
      sendResponse(fallback);
    });

    return true; // async
  },
);
