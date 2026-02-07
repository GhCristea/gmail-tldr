import initSqlJs, { Database } from 'sql.js';
import { logger } from './logger';
import type {
  EmailMetadata,
  EmailSummaryRecord,
  RecentSummariesResult,
} from '../types/db';
import type { DatabaseMessage, DatabaseResponse } from '../types/messages';

let dbPromise: Promise<Database> | null = null;

const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS email_summaries (
    message_id   TEXT PRIMARY KEY,
    thread_id    TEXT,
    from_addr    TEXT,
    subject      TEXT,
    snippet      TEXT,
    summary      TEXT,
    labels       TEXT,
    tokens_used  INTEGER,
    timestamp    INTEGER,
    processed_at INTEGER,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at   INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_email_processed_at
    ON email_summaries(processed_at DESC);

  CREATE INDEX IF NOT EXISTS idx_email_timestamp
    ON email_summaries(timestamp DESC);
`;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs();
      const db = new SQL.Database();
      db.run(DB_SCHEMA);
      logger.log('[DB] SQLite initialized');
      return db;
    })().catch(err => {
      logger.error('[DB] Initialization failed', err);
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function initializeDb(): Promise<DatabaseResponse<null>> {
  try {
    await getDb();
    return { success: true, data: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'DB_INIT_FAILED',
    };
  }
}

async function queueEmailMetadata(
  meta: EmailMetadata,
): Promise<DatabaseResponse<null>> {
  try {
    const db = await getDb();
    db.run(
      `
      INSERT INTO email_summaries (
        message_id, thread_id, from_addr, subject, snippet, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        from_addr = excluded.from_addr,
        subject   = excluded.subject,
        snippet   = excluded.snippet,
        timestamp = excluded.timestamp
      `,
      [
        meta.messageId,
        meta.threadId,
        meta.from,
        meta.subject,
        meta.snippet,
        meta.timestamp,
      ],
    );
    return { success: true, data: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'DB_QUEUE_METADATA_ERROR',
    };
  }
}

async function storeSummary(
  payload: import('../types/messages').StoreSummaryPayload,
): Promise<DatabaseResponse<null>> {
  try {
    const db = await getDb();
    db.run(
      `
      INSERT INTO email_summaries (
        message_id, summary, labels, tokens_used, processed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        summary      = excluded.summary,
        labels       = excluded.labels,
        tokens_used  = excluded.tokens_used,
        processed_at = excluded.processed_at,
        updated_at   = excluded.updated_at
      `,
      [
        payload.messageId,
        payload.summary,
        JSON.stringify(payload.labels),
        payload.tokensUsed,
        payload.processedAt,
        Date.now(),
      ],
    );
    return { success: true, data: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'DB_STORE_SUMMARY_ERROR',
    };
  }
}

async function listRecentSummaries(
  limit = 20,
): Promise<DatabaseResponse<RecentSummariesResult>> {
  try {
    const db = await getDb();

    const metaStmt = db.prepare(
      `SELECT COUNT(*) AS total_count,
              MAX(processed_at) AS last_processed
         FROM email_summaries`,
    );
    metaStmt.step();
    const metaRow = metaStmt.getAsObject() as {
      total_count: number;
      last_processed: number | null;
    };
    metaStmt.free();

    const stmt = db.prepare(
      `
      SELECT message_id, thread_id, from_addr, subject, snippet,
             summary, labels, tokens_used, timestamp, processed_at
        FROM email_summaries
       ORDER BY processed_at DESC
       LIMIT ?
      `,
    );
    stmt.bind([limit]);
    const summaries: EmailSummaryRecord[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      summaries.push({
        messageId: row.message_id,
        threadId: row.thread_id,
        from: row.from_addr,
        subject: row.subject,
        snippet: row.snippet,
        summary: row.summary,
        labels: row.labels ? JSON.parse(row.labels) : [],
        tokensUsed: row.tokens_used ?? 0,
        timestamp: row.timestamp ?? 0,
        processedAt: row.processed_at ?? 0,
      });
    }
    stmt.free();

    return {
      success: true,
      data: {
        summaries,
        totalCount: metaRow.total_count ?? 0,
        lastProcessedAt: metaRow.last_processed ?? null,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'DB_LIST_RECENT_ERROR',
    };
  }
}

async function clearAllData(): Promise<DatabaseResponse<null>> {
  try {
    const db = await getDb();
    db.run(`DELETE FROM email_summaries`);
    return { success: true, data: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'DB_CLEAR_ALL_ERROR',
    };
  }
}

async function ping(): Promise<DatabaseResponse<{ ok: boolean }>> {
  try {
    await getDb();
    return { success: true, data: { ok: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'DB_PING_ERROR',
    };
  }
}

export function isDbMessage(message: unknown): message is DatabaseMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as any).type === 'string' &&
    (message as any).type.startsWith('DB/')
  );
}

/** Single entry point for DB commands inside offscreen */
export async function handleDatabaseMessage(
  message: DatabaseMessage,
): Promise<DatabaseResponse<unknown>> {
  switch (message.type) {
    case 'DB/INITIALIZE_DB':
      return initializeDb();
    case 'DB/QUEUE_EMAIL_METADATA':
      return queueEmailMetadata(message.payload);
    case 'DB/STORE_SUMMARY':
      return storeSummary(message.payload);
    case 'DB/LIST_RECENT_SUMMARIES':
      return listRecentSummaries(message.payload?.limit);
    case 'DB/CLEAR_ALL_DATA':
      return clearAllData();
    case 'DB/PING':
      return ping();
    default:
      return {
        success: false,
        error: `Unknown DB command: ${(message as any).type}`,
        code: 'DB_UNKNOWN_COMMAND',
      };
  }
}
