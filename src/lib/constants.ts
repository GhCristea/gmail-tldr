export const SERVICE_WORKER = "SERVICE_WORKER";
export const POPUP = "POPUP";

export const SYNC_STATUS = "SYNC_STATUS";
export const NEW_EMAILS = "NEW_EMAILS";
export const TRIGGER_SYNC_NOW = "TRIGGER_SYNC_NOW";
export const CLEAR_HISTORY = "CLEAR_HISTORY";

export const STORAGE_KEY_HISTORY_ID = "gmailHistoryId";
export const STORAGE_KEY_LAST_SYNC = "lastSyncTime";
export const STORAGE_KEY_SYNC_STATUS = "syncStatus";

export const ALARM_GMAIL_CHECK = "checkGmail";

export const POLLING_INTERVAL_MINUTES = 1;

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

export const EMAIL_IMPORTANCE = ["high", "medium", "low"] as const;
