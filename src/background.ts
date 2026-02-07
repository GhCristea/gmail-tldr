import {
  ALARM_GMAIL_CHECK,
  POLLING_INTERVAL_MINUTES,
  PROCESS_EMAIL,
  PROCESSED_EMAIL_RESULT,
  PRIVACY_STATUS
} from './lib/constants'
import { fetchNewEmails, getGmailProfile } from './lib/gmail'
import { logger } from './lib/logger'
import { listenForMessages, sendMessage } from './lib/messaging'
import {
  appendNewEmails,
  getStoredHistoryId,
  getSyncStatus,
  saveHistoryId,
  setSyncStatus,
  getNlpDaemonEnabled,
  setNlpDaemonEnabled,
  clearAll
} from './lib/storage'
import type {
  EmailSummary,
  GmailHistory,
  GmailMessage,
  Message,
  ProcessedEmailResult
} from './lib/types'
import {
  ensureOffscreenReady,
  queueEmailMetadata,
  storeEmailSummary,
  listRecentSummaries,
  clearAllData as clearAllDbData,
  pingDb,
} from './background-db-integration';
import { OFFSCREEN, SERVICE_WORKER, POPUP } from './lib/constants';

// --- Lifecycle & Alarms ---

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(ALARM_GMAIL_CHECK, {
    periodInMinutes: POLLING_INTERVAL_MINUTES,
  });
  logger.log('Extension installed. Starting Gmail polling...');
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_GMAIL_CHECK) {
    void checkGmailForNewMessages()
  }
})

// --- Message Handling ---

listenForMessages<typeof POPUP, typeof SERVICE_WORKER>(
  message => {
    if (message.type === 'TRIGGER_SYNC_NOW') {
      logger.log('Manual sync triggered by popup');
      void checkGmailForNewMessages(true);
    } else if (message.type === 'CLEAR_HISTORY') {
      logger.log('Clearing history on user request');
      void chrome.storage.local.clear();
    } else if (message.type === 'REQUEST_PRIVACY_STATUS') {
      void sendPrivacyStatus();
    } else if (message.type === 'TOGGLE_NLP_STORAGE' && message.data) {
      void (async () => {
        await setNlpDaemonEnabled(message.data.enabled);
        await sendPrivacyStatus();
      })();
    } else if (message.type === 'DELETE_ALL_LOCAL_DATA') {
      void (async () => {
        logger.log('Deleting all local data (storage + SQLite)');
        try {
          await clearAllDbData();  // Try SQLite first (more likely to fail if offscreen dead)
          await clearAll();        // Then chrome.storage.local
          logger.log('Successfully deleted all local data');
        } catch (err) {
          logger.error('Failed to atomic delete all data', err);
          // In a real app we might retry or alert the user
        }
        await sendPrivacyStatus();
      })();
    }
  },
);

async function sendPrivacyStatus() {
  const enabled = await getNlpDaemonEnabled();
  let health: 'running' | 'stopped' | 'error' =
    enabled ? 'running' : 'stopped';
  let totalStored = 0;
  let lastProcessedAt: number | null = null;

  if (enabled) {
    try {
      const stats = await listRecentSummaries(1);
      totalStored = stats.totalCount;
      lastProcessedAt = stats.lastProcessedAt;
      const ok = await pingDb();
      if (!ok) health = 'error';
    } catch (err) {
      logger.warn('Failed to fetch DB stats', err);
      health = 'error';
    }
  }

  const msg: Message<typeof SERVICE_WORKER, typeof POPUP> = {
    type: PRIVACY_STATUS,
    data: {
      enabled,
      health,
      totalStored,
      lastProcessedAt,
    },
  };

  await broadcastToPopup(msg);
}

async function broadcastToPopup(message: Message<typeof SERVICE_WORKER, typeof POPUP>) {
  try {
    await chrome.runtime.sendMessage(message)
  } catch {
    // Popup closed, ignore
  }
}

// --- Email Processing Logic ---

async function checkGmailForNewMessages(manual = false) {
  const currentStatus = await getSyncStatus()
  if (currentStatus === 'syncing') {
    logger.log('Sync already in progress. Skipping.')
    return
  }

  await setSyncStatus('syncing')
  if (manual) notifyPopupSyncStatus('syncing')

  try {
    const token = await getAuthToken()
    if (!token) {
      logger.warn('No auth token available')
      await setSyncStatus('error')
      if (manual) notifyPopupSyncStatus('error')
      return
    }

    const startHistoryId = await getStoredHistoryId()
    let newHistoryId = startHistoryId

    let messages: { id: string; threadId: string }[] = []

    if (!startHistoryId) {
      // First run: get profile historyId
      logger.log('No historyId found. Fetching current profile state...')
      const profile = await getGmailProfile(token)
      if (profile.historyId) {
        newHistoryId = profile.historyId
        // Optionally fetch recent emails if needed, but for now we just start tracking
        logger.log(`Initialized historyId to ${newHistoryId}`)
      }
    } else {
      // Poll history
      const historyData = await fetchNewEmails(token, startHistoryId)
      newHistoryId = historyData.historyId || startHistoryId
      messages = extractMessagesFromHistory(historyData)
    }

    if (messages.length > 0) {
      logger.log(`Found ${messages.length} new messages`)
      const processed = await processMessages(token, messages)
      await appendNewEmails(processed)
      await notifyPopupNewEmails(processed)
    } else {
      logger.log('No new messages found.')
    }

    if (newHistoryId && newHistoryId !== startHistoryId) {
      await saveHistoryId(newHistoryId)
    }

    await setSyncStatus('idle')
    if (manual) notifyPopupSyncStatus('idle')
  } catch (error) {
    logger.error('Error in sync loop:', error)
    await setSyncStatus('error')
    if (manual) notifyPopupSyncStatus('error')
  }
}

function extractMessagesFromHistory(data: GmailHistory): { id: string; threadId: string }[] {
  if (!data.history) return []
  const msgs: { id: string; threadId: string }[] = []
  for (const h of data.history) {
    if (h.messagesAdded) {
      for (const m of h.messagesAdded) {
        msgs.push(m.message)
      }
    }
  }
  return msgs
}

async function processMessages(token: string, messages: { id: string; threadId: string }[]): Promise<EmailSummary[]> {
  const results: EmailSummary[] = []
  const nlpEnabled = await getNlpDaemonEnabled();

  // TODO: Batch DB insertions if performance becomes an issue (DB/BATCH_INSERT)
  for (const msg of messages) {
    try {
      const fullMsg = await fetchMessageDetails(token, msg.id)
      if (!fullMsg) continue

      const headers = parseHeaders(fullMsg.payload.headers)
      const body = parseBody(fullMsg.payload)
      const snippet = fullMsg.snippet

      let summary = snippet // default
      let nlpLabels: string[] = []
      let tokensUsed = 0

      // 1. Offscreen Pre-processing (Wink NLP) - GATED
      const processedResult = await preprocessEmailViaOffscreen(msg.id, body)
      
      if (processedResult) {
        // 2. LLM Summarization (Gemini Nano) - only if we have filtered text
        // (Placeholder for now, assuming Gemini integration in separate file)
        // const llmSummary = await summarizeWithGemini(processedResult.tokens.join(' '))
        
        // For now, use filtered text as summary or keep snippet if empty
        const filteredText = processedResult.tokens.join(' ')
        if (filteredText.length > 0) {
          summary = `[AI] ${filteredText.slice(0, 200)}...` 
        }
        nlpLabels = processedResult.entities
        tokensUsed = processedResult.tokens.length
      }

      const emailData: EmailSummary = {
        id: msg.id,
        threadId: msg.threadId,
        subject: headers.subject,
        from: headers.from,
        to: headers.to,
        date: headers.date,
        snippet,
        body,
        labels: nlpLabels
      }

      results.push(emailData)

      // 3. Persist to SQLite - GATED
      if (nlpEnabled && summary) {
        try {
          const meta = {
            messageId: emailData.id,
            threadId: emailData.threadId,
            from: emailData.from,
            subject: emailData.subject,
            snippet: emailData.snippet,
            timestamp: new Date(emailData.date).getTime() || Date.now(),
          };

          await queueEmailMetadata(meta);
          await storeEmailSummary({
            messageId: emailData.id,
            summary: summary,
            labels: nlpLabels,
            tokensUsed: tokensUsed,
          });
        } catch (err) {
          logger.warn(
            `Failed to persist summary for ${emailData.id} to SQLite`,
            err,
          );
        }
      }

    } catch (err) {
      logger.error(`Failed to process message ${msg.id}`, err)
    }
  }
  return results
}

async function preprocessEmailViaOffscreen(
  emailId: string,
  emailText: string,
): Promise<ProcessedEmailResult | null> {
  try {
    const nlpEnabled = await getNlpDaemonEnabled();
    if (!nlpEnabled) {
      logger.log(
        `NLP daemon disabled, skipping offscreen preprocessing for ${emailId}`,
      );
      return null;
    }

    await ensureOffscreenReady();

    const response = await sendMessage<typeof SERVICE_WORKER, typeof OFFSCREEN>({
      type: PROCESS_EMAIL,
      data: { id: emailId, text: emailText },
    });
    
    // Type guard for successful response payload
    if (response && 'data' in response && response.data) {
       return response.data;
    }
    return null

  } catch (err) {
    logger.error(`Offscreen processing failed for ${emailId}`, err)
    return null
  }
}

// --- Gmail Helpers ---

async function getAuthToken(): Promise<string | null> {
  try {
    const { token } = await chrome.identity.getAuthToken({ interactive: false })
    return token
  } catch (e) {
    // If non-interactive fails, we might need user interaction, 
    // but a background worker cannot prompt. User must open popup or options to re-auth.
    logger.warn('Auth token refresh failed', e)
    return null
  }
}

async function fetchMessageDetails(token: string, msgId: string): Promise<GmailMessage | null> {
  const url = `${GMAIL_API_BASE}/users/me/messages/${msgId}?format=full`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  return (await res.json()) as GmailMessage
}

function parseHeaders(headers?: { name: string; value: string }[]) {
  const res = { subject: '(No Subject)', from: 'Unknown', to: 'Unknown', date: '' }
  if (!headers) return res
  for (const h of headers) {
    const n = h.name.toLowerCase()
    if (n === 'subject') res.subject = h.value
    else if (n === 'from') res.from = h.value
    else if (n === 'to') res.to = h.value
    else if (n === 'date') res.date = h.value
  }
  return res
}

function parseBody(payload: GmailMessage['payload']): string {
  if (!payload) return ''
  
  let data = ''
  if (payload.body?.data) {
    data = payload.body.data
  } else if (payload.parts) {
    // simplified: find text/plain
    const plain = payload.parts.find(p => p.mimeType === 'text/plain')
    if (plain?.body?.data) data = plain.body.data
  }

  if (!data) return ''
  // Gmail body data is base64url encoded
  try {
    // standard base64 replace
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
    return atob(b64)
  } catch {
    return ''
  }
}


// --- Popup Notifications ---

async function notifyPopupSyncStatus(status: 'syncing' | 'idle' | 'error') {
  await broadcastToPopup({
    type: 'SYNC_STATUS',
    data: { status, timestamp: Date.now() }
  })
}

async function notifyPopupNewEmails(emails: EmailSummary[]) {
  await broadcastToPopup({
    type: 'NEW_EMAILS',
    data: emails
  })
}
