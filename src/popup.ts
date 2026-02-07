import {
  SERVICE_WORKER,
  POPUP,
  NEW_EMAILS,
  SYNC_STATUS,
  TRIGGER_SYNC_NOW,
  CLEAR_HISTORY,
  PRIVACY_STATUS,
  REQUEST_PRIVACY_STATUS,
  TOGGLE_NLP_STORAGE,
  DELETE_ALL_LOCAL_DATA,
} from './lib/constants';
import type { EmailSummary, SyncStatus } from './lib/types'
import { sendMessage, listenForMessages } from './lib/messaging'
import { getSyncStatus, getStoredEmails } from './lib/storage'
import { logger } from './lib/logger'

const DOM = {
  statusIndicator: document.getElementById('statusIndicator') as HTMLDivElement,
  statusText: document.getElementById('statusText') as HTMLSpanElement,
  syncNowBtn: document.getElementById('syncNowBtn') as HTMLButtonElement,
  emailsList: document.getElementById('emailsList') as HTMLDivElement,
  emptyState: document.getElementById('emptyState') as HTMLDivElement,
  clearBtn: document.getElementById('clearBtn') as HTMLButtonElement,
  nlpToggle: document.getElementById('nlpToggle') as HTMLInputElement,
  daemonState: document.getElementById('daemonState') as HTMLSpanElement,
  storageStats: document.getElementById('storageStats') as HTMLSpanElement,
  deleteAllDataBtn: document.getElementById('deleteAllDataBtn') as HTMLButtonElement,
}

let currentEmails: EmailSummary[] = []

function init() {
  DOM.syncNowBtn.addEventListener('click', () => void triggerManualSync())
  DOM.clearBtn.addEventListener('click', () => void clearHistory())

  if (DOM.nlpToggle) {
    DOM.nlpToggle.addEventListener('change', () => void toggleNlpStorage());
  }
  if (DOM.deleteAllDataBtn) {
    DOM.deleteAllDataBtn.addEventListener('click', () =>
      void deleteAllStoredData(),
    );
  }

  listenForMessages<typeof SERVICE_WORKER, typeof POPUP>(message => {
    if (message.type === SYNC_STATUS) {
      if (message.data) {
        updateStatus(message.data.status)
      }
    } else if (message.type === NEW_EMAILS) {
      if (message.data) {
        displayEmails(message.data)
      }
    } else if (message.type === PRIVACY_STATUS && message.data) {
      updatePrivacyUI(message.data);
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

    await requestPrivacyStatus();
  } catch (error) {
    logger.error('Error loading initial state:', error)
  }
}

async function requestPrivacyStatus() {
  try {
    await sendMessage<typeof POPUP, typeof SERVICE_WORKER>({
      type: REQUEST_PRIVACY_STATUS,
    } as const);
  } catch (error) {
    logger.error('Error requesting privacy status:', error);
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

function updatePrivacyUI(data: {
  enabled: boolean;
  health: 'running' | 'stopped' | 'error';
  totalStored: number;
  lastProcessedAt: number | null;
}) {
  if (DOM.nlpToggle) {
    DOM.nlpToggle.checked = data.enabled;
  }
  if (DOM.daemonState) {
    DOM.daemonState.textContent = `Daemon: ${data.health}`;
    DOM.daemonState.className = `privacy-state ${data.health}`;
  }
  if (DOM.storageStats) {
    const last =
      data.lastProcessedAt != null
        ? new Date(data.lastProcessedAt).toLocaleString()
        : 'never';
    DOM.storageStats.textContent = `${data.totalStored} emails stored · last: ${last}`;
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
      `<div class=\"email-labels\">${nlpLabels.map((label: string) => `<span class=\"label\">${escapeHtml(label)}</span>`).join('')}</div>`
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

async function toggleNlpStorage() {
  try {
    const enabled = DOM.nlpToggle?.checked ?? true;
    await sendMessage<typeof POPUP, typeof SERVICE_WORKER>({
      type: TOGGLE_NLP_STORAGE,
      data: { enabled },
    } as const);
  } catch (error) {
    logger.error('Error toggling NLP storage:', error);
  }
}

async function deleteAllStoredData() {
  if (
    !confirm(
      'Delete all stored summaries and local data? This cannot be undone.',
    )
  ) {
    return;
  }
  try {
    await sendMessage<typeof POPUP, typeof SERVICE_WORKER>({
      type: DELETE_ALL_LOCAL_DATA,
    } as const);
    currentEmails = [];
    DOM.emailsList.innerHTML = '';
    DOM.emptyState.style.display = 'flex';
    logger.log('All local data deleted');
  } catch (error) {
    logger.error('Error deleting all stored data:', error);
  }
}

init()
