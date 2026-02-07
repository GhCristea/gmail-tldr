import type {
  SERVICE_WORKER,
  POPUP,
  OFFSCREEN,
  SYNC_STATUS,
  NEW_EMAILS,
  TRIGGER_SYNC_NOW,
  CLEAR_HISTORY,
  PROCESS_EMAIL,
  PROCESSED_EMAIL_RESULT,
  PRIVACY_STATUS,
  REQUEST_PRIVACY_STATUS,
  TOGGLE_NLP_STORAGE,
  DELETE_ALL_LOCAL_DATA
} from './constants'

export type EmailSummary = {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  body?: string
  labels?: string[]
}

export type SyncStatus = 'syncing' | 'idle' | 'error'

export type Payload<T> = { data: T; error?: null } | { data?: null; error: string }

export type SuccessPayload<T> = { data: T; error?: null }
export type ErrorPayload = { data?: null; error: string }

export type ProcessEmailPayload = { id: string; text: string }

export type ProcessedEmailResult = { id: string; tokens: string[]; entities: string[]; pos: string[] }

export type MessageMap = {
  [SERVICE_WORKER]: {
    [POPUP]:
      | ({ type: typeof SYNC_STATUS } & Payload<{ status: SyncStatus; timestamp: number }>)
      | ({ type: typeof NEW_EMAILS } & Payload<EmailSummary[]>)
      | ({ type: typeof PRIVACY_STATUS } &
          Payload<{
            enabled: boolean;
            health: 'running' | 'stopped' | 'error';
            totalStored: number;
            lastProcessedAt: number | null;
          }>);
    [OFFSCREEN]: { type: typeof PROCESS_EMAIL } & Payload<ProcessEmailPayload>
  }
  [POPUP]: {
    [SERVICE_WORKER]: 
      | { type: typeof TRIGGER_SYNC_NOW } 
      | { type: typeof CLEAR_HISTORY }
      | { type: typeof REQUEST_PRIVACY_STATUS }
      | ({ type: typeof TOGGLE_NLP_STORAGE } & Payload<{ enabled: boolean }>)
      | { type: typeof DELETE_ALL_LOCAL_DATA }
  }
  [OFFSCREEN]: { [SERVICE_WORKER]: { type: typeof PROCESSED_EMAIL_RESULT } & Payload<ProcessedEmailResult> }
}

export type Sender = keyof MessageMap
export type Receiver<T extends Sender> = keyof MessageMap[T]

export type Message<From extends Sender, To extends Receiver<From> = Receiver<From>> = MessageMap[From][To]

export type GmailHistory = {\n  history?: {\n    id: string\n    messages?: { id: string; threadId: string }[]\n    messagesAdded?: { message: { id: string; threadId: string } }[]\n  }[]\n  nextHistoryId?: string\n  historyId?: string\n}

export type GmailMessage = {
  id: string
  threadId: string
  labelIds?: string[]
  snippet: string
  payload: {
    headers?: { name: string; value: string }[]
    parts?: GmailMessagePart[]
    body?: { data?: string; size?: number }
  }
}

export type GmailMessagePart = {
  mimeType: string
  filename: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number }
  parts?: GmailMessagePart[]
}
