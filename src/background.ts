import {
  SERVICE_WORKER,
  POPUP,
  OFFSCREEN,
  NEW_EMAILS,
  ALARM_GMAIL_CHECK,
  POLLING_INTERVAL_MINUTES,
  PROCESS_EMAIL,
  PROCESSED_EMAIL_RESULT,
  OFFSCREEN_DOCUMENT_PATH,
  OFFSCREEN_REASON
} from './lib/constants.js'
import type { Message, EmailSummary, ProcessedEmailResult } from './lib/types.js'
import { listenForMessages, sendMessage } from './lib/messaging.js'
import { logger } from './lib/logger.js'
import { getAuthToken, getUserProfile, getHistoryChanges, getFullMessage, extractEmailData } from './lib/gmail.js'
import { getStoredHistoryId, saveHistoryId, setSyncStatus, appendNewEmails, getSyncStatus } from './lib/storage.js'
import { GeminiNanoService } from './lib/ai/gemini.js'

const processedMessageIds = new Set<string>()
const gemini = new GeminiNanoService()

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(ALARM_GMAIL_CHECK, { periodInMinutes: POLLING_INTERVAL_MINUTES })
  void ensureOffscreenDocument()
  logger.log('Extension installed. Starting Gmail polling...')
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_GMAIL_CHECK) {
    void checkGmailForNewMessages(false)
  }
})

listenForMessages<typeof POPUP, typeof SERVICE_WORKER>(message => {
  if (message.type === 'TRIGGER_SYNC_NOW') {
    logger.log('Manual sync triggered by popup')
    void checkGmailForNewMessages(true)
  } else if (message.type === 'CLEAR_HISTORY') {
    logger.log('Clearing history on user request')
    void chrome.storage.local.clear()
  }
})

async function ensureOffscreenDocument() {
  try {
    const clients = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
    })

    if (!clients || !clients.length) {
      logger.log('Creating offscreen document...')
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [OFFSCREEN_REASON as chrome.offscreen.Reason],
        justification: 'Email pre-processing and NLP filtering via Wink'
      })
      logger.log('Offscreen document created')
    }
  } catch (error) {
    logger.warn('Offscreen document check/creation failed:', error)
  }
}

async function preprocessEmailViaOffscreen(
  emailId: string,
  emailText: string
): Promise<ProcessedEmailResult | null> {
  try {
    await ensureOffscreenDocument()

    const response = await sendMessage<typeof SERVICE_WORKER, typeof OFFSCREEN>({
      type: PROCESS_EMAIL,
      data: { id: emailId, text: emailText }
    })

    if (response && typeof response === 'object' && 'type' in response) {
      const msg = response as Message<typeof OFFSCREEN, typeof SERVICE_WORKER>
      if (msg.type === PROCESSED_EMAIL_RESULT && msg.data) {
        logger.log(
          `✓ Preprocessing complete for ${emailId}: ${msg.data.tokens.length} tokens, ${msg.data.entities.length} entities`
        )
        return msg.data
      }
    }

    logger.warn(`✗ No valid response from offscreen for email ${emailId}`)
    return null
  } catch (error) {
    logger.error(`✗ Error preprocessing email ${emailId} via offscreen:`, error)
    return null
  }
}

async function checkGmailForNewMessages(interactive: boolean = false) {
  try {
    const currentStatus = await getSyncStatus()
    if (currentStatus === 'syncing') {
      logger.log('Sync already in progress, skipping.')
      return
    }

    await setSyncStatus('syncing')
    logger.log('Starting email sync...')

    const token = await getAuthToken(interactive)
    const historyId = await getStoredHistoryId()

    if (!historyId) {
      logger.log('First sync - initializing history ID')
      const profile = await getUserProfile(token)
      await saveHistoryId(profile.historyId)
      await setSyncStatus('idle')
      return
    }

    const historyResponse = await getHistoryChanges(token, historyId)
    const newHistoryId = historyResponse.nextHistoryId || historyResponse.historyId

    if (!historyResponse.history || historyResponse.history.length === 0) {
      logger.log('No new messages')
      await setSyncStatus('idle')
      return
    }

    logger.log(`Found ${historyResponse.history.length} history records`)

    const newEmails: EmailSummary[] = []

    for (const historyRecord of historyResponse.history) {
      if (!historyRecord.messagesAdded) continue

      for (const messageAdded of historyRecord.messagesAdded) {
        const messageId = messageAdded.message.id

        if (processedMessageIds.has(messageId)) {
          logger.log(`Skipping already processed message: ${messageId}`)
          continue
        }

        try {
          logger.log(`\n━━━ Processing message: ${messageId} ━━━`)

          const fullMessage = await getFullMessage(token, messageId)
          const emailData = extractEmailData(fullMessage)

          logger.log('Email extracted:', {
            subject: emailData.subject,
            from: emailData.from,
            snippetLength: emailData.snippet?.length
          })

          const preprocessed = await preprocessEmailViaOffscreen(
            messageId,
            emailData.body || emailData.snippet || ''
          )

          if (preprocessed && preprocessed.tokens.length > 0) {
            const filteredText = preprocessed.tokens.join(' ')
            logger.log(`Calling Gemini Nano for email ${messageId}...`)
            const summaryResult = await gemini.summarize(filteredText, {
              subject: emailData.subject,
              from: emailData.from
            })

            Object.assign(emailData, {
              summary: summaryResult.text,
              nlpLabels: preprocessed.entities,
              tokensUsed: summaryResult.tokensUsed
            })
            logger.log(`✓ Summary attached: ${summaryResult.text.substring(0, 60)}...`)
          } else {
            logger.warn(`⚠ Preprocessing returned empty or failed for ${messageId}, skipping Gemini`)
            Object.assign(emailData, { summary: '(Preprocessing failed)', nlpLabels: [], tokensUsed: 0 })
          }

          newEmails.push(emailData)
          processedMessageIds.add(messageId)
        } catch (error) {
          logger.error(`✗ Error processing message ${messageId}:`, error)
        }
      }
    }

    if (newHistoryId) {
      await saveHistoryId(newHistoryId)
    }

    if (newEmails.length > 0) {
      await appendNewEmails(newEmails)
      const message: Message<typeof SERVICE_WORKER, typeof POPUP> = { type: NEW_EMAILS, data: newEmails }
      await broadcastToPopup(message)

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Gmail TLDR',
        message: `${newEmails.length} new email(s) processed`
      })
    }

    await setSyncStatus('idle')
    logger.log(`\n✓ Sync complete. Processed ${newEmails.length} emails`)
  } catch (error) {
    logger.error('Error during Gmail sync:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    await setSyncStatus('error')
  }
}

async function broadcastToPopup(message: Message<typeof SERVICE_WORKER, typeof POPUP>) {
  try {
    const result = await chrome.runtime.sendMessage<typeof message, unknown>(message)
    logger.log('Message broadcast to popup', result)
  } catch (error) {
    logger.debug('Popup not listening (likely not open)', error)
  }
}

setInterval(
  () => {
    if (processedMessageIds.size > 5000) {
      const array = Array.from(processedMessageIds)
      processedMessageIds.clear()

      array.slice(-2500).forEach(id => processedMessageIds.add(id))
      logger.log('Trimmed processed message cache')
    }
  },
  60 * 60 * 1000
)
