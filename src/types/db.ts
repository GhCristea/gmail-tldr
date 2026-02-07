/**
 * Key-point structure for email summaries
 */
export interface EmailKeyPoint {
  id: string; // UUID
  emailId: string; // Gmail message ID
  keyPoint: string; // Extracted key point
  extractedAt: number; // Unix timestamp
  source: 'wink-nlp' | 'gemini-nano'; // Which stage extracted it
  confidence: number; // 0-1
  tags: string[]; // ["deadline", "actionable", "follow-up"]
  encryptionNonce?: string; // If encrypted at rest
}

/**
 * Email metadata for tracking and privacy
 */
export interface EmailMetadata {
  emailId: string;
  from: string;
  subject: string;
  timestamp: number;
  keyPointCount: number;
  lastProcessed: number;
}

/**
 * DB stats for privacy audit and dashboard
 */
export interface DBStats {
  totalKeyPoints: number;
  totalEmails: number;
  storageUsedBytes: number;
  oldestEntry: number; // Unix timestamp
}
