import {
  SERVICE_WORKER,
  POPUP,
  NEW_EMAILS,
  SYNC_STATUS,
  TRIGGER_SYNC_NOW,
  CLEAR_HISTORY
} from './lib/constants.js'
import type { EmailSummary, SyncStatus } from './lib/types.js'
import { sendMessage, listenForMessages } from './lib/messaging.js'
import { getSyncStatus, getStoredEmails } from './lib/storage.js'
import { logger } from './lib/logger.js'

const DOM = {
  statusIndicator: document.getElementById('statusIndicator') as HTMLDivElement,
  statusText: document.getElementById('statusText') as HTMLSpanElement,
  syncNowBtn: document.getElementById('syncNowBtn') as HTMLButtonElement,
  emailsList: document.getElementById('emailsList') as HTMLDivElement,
  emptyState: document.getElementById('emptyState') as HTMLDivElement,
  clearBtn: document.getElementById('clearBtn') as HTMLButtonElement
}

let currentEmails: EmailSummary[] = []

function init() {
  DOM.syncNowBtn.addEventListener('click', () => void triggerManualSync())
  DOM.clearBtn.addEventListener('click', () => void clearHistory())

  listenForMessages<typeof SERVICE_WORKER, typeof POPUP>(message => {
    if (message.type === SYNC_STATUS) {
      if (message.data) {
        updateStatus(message.data.status)
      }
    } else if (message.type === NEW_EMAILS) {
      if (message.data) {
        displayEmails(message.data)
      }
    }
  })

  void loadInitialState()
}

async function loadInitialState() {
  try {
    const status = await getSyncStatus()
    updateStatus(status)

    const storedEmails = await getStoredEmails()
    if (storedEmails.length > 0) {
      displayEmails(storedEmails)
    }
  } catch (error) {
    logger.error('Error loading initial state:', error)
  }
}

function updateStatus(status: SyncStatus) {
  DOM.statusIndicator.className = `status-indicator ${status}`

  const statusText = { idle: 'Idle', syncing: 'Syncing...', error: 'Error' }
  DOM.statusText.textContent = statusText[status]

  if (status === 'syncing') {
    DOM.syncNowBtn.disabled = true
    DOM.syncNowBtn.textContent = 'Syncing...'
  } else {
    DOM.syncNowBtn.disabled = false
    DOM.syncNowBtn.textContent = 'Sync Now'
  }
}

function displayEmails(emails: EmailSummary[]) {
  currentEmails = [...currentEmails, ...emails]

  currentEmails = currentEmails.slice(-50)

  DOM.emailsList.innerHTML = ''

  if (currentEmails.length === 0) {
    DOM.emptyState.style.display = 'flex'
    return
  }

  DOM.emptyState.style.display = 'none'

  currentEmails.reverse().forEach(email => {
    const emailEl = createEmailElement(email)
    DOM.emailsList.appendChild(emailEl)
  })
}

function createEmailElement(
  email: EmailSummary & { summary?: string; nlpLabels?: string[]; tokensUsed?: number }
) {
  const div = document.createElement('div')
  div.className = 'email-item'

  const summary = email.summary || '(No summary)'
  const nlpLabels = email.nlpLabels || []
  const tokensUsed = email.tokensUsed || 0

  const labelsHtml =
    nlpLabels.length > 0 ?
      `<div class="email-labels">${nlpLabels.map((label: string) => `<span class="label">${escapeHtml(label)}</span>`).join('')}</div>`
    : ''

  // eslint-disable-next-line no-unsanitized/property
  div.innerHTML = `
    <div class="email-subject" title="${escapeHtml(email.subject)}">${escapeHtml(email.subject)}</div>
    <div class="email-from">${escapeHtml(email.from)}</div>
    <div class="email-summary">${escapeHtml(summary)}</div>
    ${labelsHtml}
    <div class="email-meta">${tokensUsed > 0 ? `${tokensUsed} tokens` : ''}</div>
  `
  return div
}

function escapeHtml(text: string) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

async function triggerManualSync() {
  try {
    const message = { type: TRIGGER_SYNC_NOW } as const

    await sendMessage<typeof POPUP, typeof SERVICE_WORKER>(message)
    logger.log('Manual sync triggered')
  } catch (error) {
    logger.error('Error triggering sync:', error)
  }
}

async function clearHistory() {
  if (confirm('Clear all history? This will reset the next sync.')) {
    try {
      const message = { type: CLEAR_HISTORY } as const
      await sendMessage<typeof POPUP, typeof SERVICE_WORKER>(message)
      currentEmails = []
      DOM.emailsList.innerHTML = ''
      DOM.emptyState.style.display = 'flex'
      logger.log('History cleared')
    } catch (error) {
      logger.error('Error clearing history:', error)
    }
  }
}

init()
