import {
  SERVICE_WORKER,
  POPUP,
  NEW_EMAILS,
  SYNC_STATUS,
  TRIGGER_SYNC_NOW,
  CLEAR_HISTORY,
} from "./lib/constants.js";
import type { EmailSummary, SyncStatus } from "./lib/types.js";
import { sendMessage, listenForMessages } from "./lib/messaging.js";
import { getSyncStatus } from "./lib/storage.js";
import { logger } from "./lib/logger.js";

/**
 * Popup UI controller
 * Displays sync status and recent emails
 * Sends commands to Service Worker
 */

const DOM = {
  statusIndicator: document.getElementById("statusIndicator") as HTMLDivElement,
  statusText: document.getElementById("statusText") as HTMLSpanElement,
  syncNowBtn: document.getElementById("syncNowBtn") as HTMLButtonElement,
  emailsList: document.getElementById("emailsList") as HTMLDivElement,
  emptyState: document.getElementById("emptyState") as HTMLDivElement,
  clearBtn: document.getElementById("clearBtn") as HTMLButtonElement,
};

let currentEmails: EmailSummary[] = [];

/**
 * Initialize popup
 */
function init(): void {
  // Setup event listeners
  DOM.syncNowBtn.addEventListener("click", triggerManualSync);
  DOM.clearBtn.addEventListener("click", clearHistory);

  // Listen for messages from Service Worker
  listenForMessages<typeof SERVICE_WORKER, typeof POPUP>((message) => {
    if (message.type === SYNC_STATUS) {
      if (message.data) {
        updateStatus(message.data.status);
      }
    } else if (message.type === NEW_EMAILS) {
      if (message.data) {
        displayEmails(message.data);
      }
    }
  });

  // Load initial state
  loadInitialState();
}

/**
 * Load initial UI state from storage
 */
async function loadInitialState(): Promise<void> {
  try {
    const status = await getSyncStatus();
    updateStatus(status);
  } catch (error) {
    logger.error("Error loading initial state:", error);
  }
}

/**
 * Update status indicator and text
 */
function updateStatus(status: SyncStatus): void {
  // Update class
  DOM.statusIndicator.className = `status-indicator ${status}`;

  // Update text
  const statusText: Record<SyncStatus, string> = {
    idle: "Idle",
    syncing: "Syncing...",
    error: "Error",
  };

  DOM.statusText.textContent = statusText[status];
}

/**
 * Display emails in the list
 */
function displayEmails(emails: EmailSummary[]): void {
  currentEmails = [...currentEmails, ...emails];
  // Keep only the 50 most recent
  currentEmails = currentEmails.slice(-50);

  // Clear list
  DOM.emailsList.innerHTML = "";

  if (currentEmails.length === 0) {
    DOM.emptyState.style.display = "flex";
    return;
  }

  DOM.emptyState.style.display = "none";

  // Add emails in reverse chronological order
  currentEmails.reverse().forEach((email) => {
    const emailEl = createEmailElement(email);
    DOM.emailsList.appendChild(emailEl);
  });
}

/**
 * Create email list item element
 */
function createEmailElement(email: EmailSummary): HTMLElement {
  const div = document.createElement("div");
  div.className = "email-item";
  div.innerHTML = `
    <div class="email-subject" title="${escapeHtml(email.subject)}">${escapeHtml(email.subject)}</div>
    <div class="email-from">${escapeHtml(email.from)}</div>
    <div class="email-snippet">${escapeHtml(email.snippet)}</div>
  `;
  return div;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Trigger manual sync via Service Worker
 */
async function triggerManualSync(): Promise<void> {
  try {
    const message = {
      type: TRIGGER_SYNC_NOW,
    } as const;

    await sendMessage<typeof POPUP, typeof SERVICE_WORKER>(message);
    logger.log("Manual sync triggered");
  } catch (error) {
    logger.error("Error triggering sync:", error);
  }
}

/**
 * Clear history and reset
 */
async function clearHistory(): Promise<void> {
  if (confirm("Clear all history? This will reset the next sync.")) {
    try {
      const message = {
        type: CLEAR_HISTORY,
      } as const;
      await sendMessage<typeof POPUP, typeof SERVICE_WORKER>(message);
      currentEmails = [];
      DOM.emailsList.innerHTML = "";
      DOM.emptyState.style.display = "flex";
      logger.log("History cleared");
    } catch (error) {
      logger.error("Error clearing history:", error);
    }
  }
}

// Start the popup
init();
