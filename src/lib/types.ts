import type {
  SERVICE_WORKER,
  POPUP,
  SYNC_STATUS,
  NEW_EMAILS,
  TRIGGER_SYNC_NOW,
  CLEAR_HISTORY,
} from "./constants";

/**
 * Email data extracted from Gmail API
 */
export type EmailSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  labels?: string[];
};

/**
 * Sync status type
 */
export type SyncStatus = "syncing" | "idle" | "error";

/**
 * Payload wrapper for success or error
 */
export type Payload<T> = 
  | { data: T; error?: null }
  | { data?: null; error: string };

export type SuccessPayload<T> = { data: T; error?: null };
export type ErrorPayload = { data?: null; error: string };

/**
 * Message contract: who talks to whom and what they say
 * Using discriminated unions for type safety
 */
export type MessageMap = {
  [SERVICE_WORKER]: {
    [POPUP]: 
      | ({
          type: typeof SYNC_STATUS;
        } & Payload<{ status: SyncStatus; timestamp: number }>)
      | ({
          type: typeof NEW_EMAILS;
        } & Payload<EmailSummary[]>);
  };
  [POPUP]: {
    [SERVICE_WORKER]: 
      | {
          type: typeof TRIGGER_SYNC_NOW;
        }
      | {
          type: typeof CLEAR_HISTORY;
        };
  };
};

/**
 * Sender and receiver types for type-safe messaging
 */
export type Sender = keyof MessageMap;
export type Receiver<T extends Sender> = keyof MessageMap[T];

/**
 * Generic message type that enforces contract
 */
export type Message<
  From extends Sender,
  To extends Receiver<From> = Receiver<From>
> = MessageMap[From][To];

/**
 * Gmail API history response
 */
export type GmailHistory = {
  history?: Array<{
    id: string;
    messages?: Array<{
      id: string;
      threadId: string;
    }>;
    messagesAdded?: Array<{
      message: {
        id: string;
        threadId: string;
      };
    }>;
  }>;
  nextHistoryId?: string;
  historyId?: string;
};

/**
 * Gmail API message response
 */
export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload: {
    headers?: Array<{
      name: string;
      value: string;
    }>;
    parts?: GmailMessagePart[];
    body?: {
      data?: string;
      size?: number;
    };
  };
};

export type GmailMessagePart = {
  mimeType: string;
  filename: string;
  headers?: Array<{
    name: string;
    value: string;
  }>;
  body?: {
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
};
