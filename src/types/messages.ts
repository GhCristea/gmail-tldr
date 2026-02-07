import type { EmailMetadata, RecentSummariesResult } from './db';

export type DbInitializeMessage = {
  type: 'DB/INITIALIZE_DB';
};

export type DbQueueEmailMetadataMessage = {
  type: 'DB/QUEUE_EMAIL_METADATA';
  payload: EmailMetadata;
};

export interface StoreSummaryPayload {
  messageId: string;
  summary: string;
  labels: string[];
  tokensUsed: number;
  processedAt: number;
}

export type DbStoreSummaryMessage = {
  type: 'DB/STORE_SUMMARY';
  payload: StoreSummaryPayload;
};

export type DbListRecentSummariesMessage = {
  type: 'DB/LIST_RECENT_SUMMARIES';
  payload?: { limit?: number };
};

export type DbClearAllDataMessage = {
  type: 'DB/CLEAR_ALL_DATA';
};

export type DbPingMessage = {
  type: 'DB/PING';
};

export type DatabaseMessage =
  | DbInitializeMessage
  | DbQueueEmailMetadataMessage
  | DbStoreSummaryMessage
  | DbListRecentSummariesMessage
  | DbClearAllDataMessage
  | DbPingMessage;

export type DatabaseResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
