import type { EmailKeyPoint } from './db';

/**
 * Discriminated union for type-safe DB messages
 */
export type DatabaseMessage =
  | { action: 'DB_INSERT_KEYPOINT'; payload: EmailKeyPoint }
  | { action: 'DB_QUERY_KEYPOINTS'; emailId: string }
  | { action: 'DB_DELETE_EMAIL'; emailId: string }
  | { action: 'DB_EXPORT_DATA'; format: 'json' | 'csv' }
  | { action: 'DB_STATS' }
  | { action: 'DB_CLEAR_ALL'; confirmToken: string };

/**
 * Type-safe response wrapper
 */
export type DatabaseResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
