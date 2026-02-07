/**
 * Minimal, privacy-aware metadata we persist
 */
export interface EmailMetadata {
  messageId: string;  // Gmail message ID
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  timestamp: number;  // Unix ms
}

/**
 * Full summary record stored in SQLite
 */
export interface EmailSummaryRecord extends EmailMetadata {
  summary: string;
  labels: string[];     // wink/gemini-derived tags
  tokensUsed: number;
  processedAt: number;  // Unix ms
}

/**
 * Result shape for listing recent summaries
 */
export interface RecentSummariesResult {
  summaries: EmailSummaryRecord[];
  totalCount: number;
  lastProcessedAt: number | null;
}
