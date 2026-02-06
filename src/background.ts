import {
  SERVICE_WORKER,
  POPUP,
  NEW_EMAILS,
  ALARM_GMAIL_CHECK,
  POLLING_INTERVAL_MINUTES,
} from "./lib/constants.js";
import type { Message, EmailSummary } from "./lib/types.js";
import { listenForMessages } from "./lib/messaging.js";
import { logger } from "./lib/logger.js";
import {
  getAuthToken,
  getUserProfile,
  getHistoryChanges,
  getFullMessage,
  extractEmailData,
} from "./lib/gmail.js";
import { getStoredHistoryId, saveHistoryId, setSyncStatus } from "./lib/storage.js";

const processedMessageIds = new Set<string>();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(ALARM_GMAIL_CHECK, {
    periodInMinutes: POLLING_INTERVAL_MINUTES,
  });
  logger.log("Extension installed. Starting Gmail polling...");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_GMAIL_CHECK) {
    void checkGmailForNewMessages(false);
  }
});

listenForMessages<typeof POPUP, typeof SERVICE_WORKER>((message) => {
  if (message.type === "TRIGGER_SYNC_NOW") {
    logger.log("Manual sync triggered by popup");
    void checkGmailForNewMessages(true);
  } else if (message.type === "CLEAR_HISTORY") {
    logger.log("Clearing history on user request");
    void chrome.storage.local.clear();
  }
});

async function checkGmailForNewMessages(interactive: boolean = false) {
  try {
    await setSyncStatus("syncing");
    logger.log("Starting email sync...");

    const token = await getAuthToken(interactive);

    const historyId = await getStoredHistoryId();

    if (!historyId) {
      logger.log("First sync - initializing history ID");
      const profile = await getUserProfile(token);
      await saveHistoryId(profile.historyId);
      await setSyncStatus("idle");
      return;
    }

    const historyResponse = await getHistoryChanges(token, historyId);
    const newHistoryId = historyResponse.nextHistoryId || historyResponse.historyId;

    if (!historyResponse.history || historyResponse.history.length === 0) {
      logger.log("No new messages");
      await setSyncStatus("idle");
      return;
    }

    logger.log(`Found ${historyResponse.history.length} history records`);

    const newEmails: EmailSummary[] = [];

    for (const historyRecord of historyResponse.history) {
      if (!historyRecord.messagesAdded) continue;

      for (const messageAdded of historyRecord.messagesAdded) {
        const messageId = messageAdded.message.id;

        if (processedMessageIds.has(messageId)) {
          logger.log(`Skipping already processed message: ${messageId}`);
          continue;
        }

        try {
          logger.log(`Processing message: ${messageId}`);

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

    if (newHistoryId) {
      await saveHistoryId(newHistoryId);
    }

    if (newEmails.length > 0) {
      const message: Message<typeof SERVICE_WORKER, typeof POPUP> = {
        type: NEW_EMAILS,
        data: newEmails,
      };
      await broadcastToPopup(message);

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Gmail TLDR",
        message: `${newEmails.length} new email(s) processed`,
      });
    }

    await setSyncStatus("idle");
    logger.log(`Sync complete. Processed ${newEmails.length} emails`);
  } catch (error) {
    logger.error(
      "Error during Gmail sync:",
      JSON.stringify(error, Object.getOwnPropertyNames(error))
    );
    await setSyncStatus("error");
  }
}

async function broadcastToPopup(message: Message<typeof SERVICE_WORKER, typeof POPUP>) {
  try {
    const result = await chrome.runtime.sendMessage<typeof message, unknown>(message);
    logger.log("Message broadcast to popup", result);
  } catch (error) {
    logger.debug("Popup not listening (likely not open)", error);
  }
}

setInterval(
  () => {
    if (processedMessageIds.size > 5000) {
      const array = Array.from(processedMessageIds);
      processedMessageIds.clear();

      array.slice(-2500).forEach((id) => processedMessageIds.add(id));
      logger.log("Trimmed processed message cache");
    }
  },
  60 * 60 * 1000
);
