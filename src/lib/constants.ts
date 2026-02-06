/**
 * Message type constants
 */
export const SERVICE_WORKER = "SERVICE_WORKER";
export const POPUP = "POPUP";

/**
 * Message action types
 */
export const SYNC_STATUS = "SYNC_STATUS";
export const NEW_EMAILS = "NEW_EMAILS";
export const TRIGGER_SYNC_NOW = "TRIGGER_SYNC_NOW";
export const CLEAR_HISTORY = "CLEAR_HISTORY";

/**
 * Storage keys
 */
export const STORAGE_KEY_HISTORY_ID = "gmailHistoryId";
export const STORAGE_KEY_LAST_SYNC = "lastSyncTime";
export const STORAGE_KEY_SYNC_STATUS = "syncStatus";

/**
 * Alarm names
 */
export const ALARM_GMAIL_CHECK = "checkGmail";

/**
 * Polling interval (minutes)
 */
export const POLLING_INTERVAL_MINUTES = 1;

/**
 * Gmail API base URL
 */
export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

/**
 * Email importance levels
 */
export const EMAIL_IMPORTANCE = ["high", "medium", "low"] as const;
