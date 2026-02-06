import type {
  SERVICE_WORKER,
  POPUP,
  SYNC_STATUS,
  NEW_EMAILS,
  TRIGGER_SYNC_NOW,
  CLEAR_HISTORY,
} from "./constants.js";

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

export type SyncStatus = "syncing" | "idle" | "error";

export type Payload<T> = { data: T; error?: null } | { data?: null; error: string };

export type SuccessPayload<T> = { data: T; error?: null };
export type ErrorPayload = { data?: null; error: string };

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

export type Sender = keyof MessageMap;
export type Receiver<T extends Sender> = keyof MessageMap[T];

export type Message<
  From extends Sender,
  To extends Receiver<From> = Receiver<From>,
> = MessageMap[From][To];

export type GmailHistory = {
  history?: {
    id: string;
    messages?: {
      id: string;
      threadId: string;
    }[];
    messagesAdded?: {
      message: {
        id: string;
        threadId: string;
      };
    }[];
  }[];
  nextHistoryId?: string;
  historyId?: string;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload: {
    headers?: {
      name: string;
      value: string;
    }[];
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
  headers?: {
    name: string;
    value: string;
  }[];
  body?: {
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
};
