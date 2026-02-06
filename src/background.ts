import {
  SERVICE_WORKER,
  POPUP,
  NEW_EMAILS,
  SYNC_STATUS,
  ALARM_GMAIL_CHECK,
  POLLING_INTERVAL_MINUTES,
} from "./lib/constants";
import type { Message, EmailSummary, SyncStatus } from "./lib/types";
import { sendMessage, listenForMessages } from "./lib/messaging";
import { logger } from "./lib/logger";
import {
  getAuthToken,
  getUserProfile,
  getHistoryChanges,
  getFullMessage,
  extractEmailData,
} from "./lib/gmail";
import {
  getStoredHistoryId,
  saveHistoryId,
  setSyncStatus,
  getSyncStatus,
} from "./lib/storage";

/**
 * Gmail TLDR Service Worker
 * Polls Gmail API for new messages and broadcasts updates via typed messages
 */

// In-memory cache of processed message IDs to avoid duplicates
const processedMessageIds = new Set<string>();

/**
 * Initialize the polling alarm when extension loads
 */
chrome.runtime.onInstalled.addListener(() => {
  logger.log("Extension installed. Starting Gmail polling...");
  chrome.alarms.create(ALARM_GMAIL_CHECK, { periodInMinutes: POLLING_INTERVAL_MINUTES });
});

/**
 * Handle alarm trigger: check Gmail for new messages
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_GMAIL_CHECK) {
    checkGmailForNewMessages();
  }
});

/**
 * Listen for messages from Popup
 */
listenForMessages<typeof POPUP, typeof SERVICE_WORKER>((message, sender) => {
  if (message.type === "TRIGGER_SYNC_NOW") {
    logger.log("Manual sync triggered by popup");
    checkGmailForNewMessages();
  } else if (message.type === "CLEAR_HISTORY") {
    logger.log("Clearing history on user request");
    chrome.storage.local.clear();
  }
});

/**
 * Main function: check Gmail for new messages
 */
async function checkGmailForNewMessages(): Promise<void> {
  try {
    await setSyncStatus("syncing");
    logger.log("Starting email sync...");

    // Get auth token
    const token = await getAuthToken();

    // Get current history ID
    let historyId = await getStoredHistoryId();

    if (!historyId) {
      // First run: initialize with current state
      logger.log("First sync - initializing history ID");
      const profile = await getUserProfile(token);
      await saveHistoryId(profile.historyId);
      await setSyncStatus("idle");
      return;
    }

    // Get changes since last history ID
    const historyResponse = await getHistoryChanges(token, historyId);
    const newHistoryId = historyResponse.nextHistoryId || historyResponse.historyId;

    if (!historyResponse.history || historyResponse.history.length === 0) {
      logger.log("No new messages");
      await setSyncStatus("idle");
      return;
    }

    logger.log(`Found ${historyResponse.history.length} history records`);

    // Process new messages
    const newEmails: EmailSummary[] = [];

    for (const historyRecord of historyResponse.history) {
      if (!historyRecord.messagesAdded) continue;

      for (const messageAdded of historyRecord.messagesAdded) {
        const messageId = messageAdded.message.id;

        // Skip if we've already processed this
        if (processedMessageIds.has(messageId)) {
          logger.log(`Skipping already processed message: ${messageId}`);
          continue;
        }

        try {
          logger.log(`Processing message: ${messageId}`);

          // Fetch full message details
          const fullMessage = await getFullMessage(token, messageId);
          const emailData = extractEmailData(fullMessage);

          logger.log("Email processed:", {
            subject: emailData.subject,
            from: emailData.from,
            snippet: emailData.snippet?.substring(0, 50),
          });

          newEmails.push(emailData);
          processedMessageIds.add(messageId);
        } catch (error) {
          logger.error(`Error processing message ${messageId}:`, error);
        }
      }
    }

    // Update history ID
    if (newHistoryId) {
      await saveHistoryId(newHistoryId);
    }

    // Broadcast new emails to popup
    if (newEmails.length > 0) {
      const message: Message<typeof SERVICE_WORKER, typeof POPUP> = {
        type: NEW_EMAILS,
        data: newEmails,
      };
      await broadcastToPopup(message);

      // Show notification
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon-128.png",
        title: "Gmail TLDR",
        message: `${newEmails.length} new email(s) processed`,
      });
    }

    await setSyncStatus("idle");
    logger.log(`Sync complete. Processed ${newEmails.length} emails`);
  } catch (error) {
    logger.error("Error during Gmail sync:", error);
    await setSyncStatus("error");
  }
}

/**
 * Broadcast message to popup if it's open
 * Errors are silently caught since popup may not be open
 */
async function broadcastToPopup(
  message: Message<typeof SERVICE_WORKER, typeof POPUP>
): Promise<void> {
  try {
    // Try to send to popup
    const result = await chrome.runtime.sendMessage(message);
    logger.log("Message broadcast to popup", result);
  } catch (error) {
    // Popup is likely not open, which is fine
    logger.debug("Popup not listening (likely not open)");
  }
}

/**
 * Cleanup: periodically trim the in-memory cache if it gets too large
 */
setInterval(() => {
  if (processedMessageIds.size > 5000) {
    const array = Array.from(processedMessageIds);
    processedMessageIds.clear();
    // Keep only the last 2500
    array.slice(-2500).forEach((id) => processedMessageIds.add(id));
    logger.log("Trimmed processed message cache");
  }
}, 60 * 60 * 1000); // Every hour
