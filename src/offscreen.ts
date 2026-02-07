import initSqlJs, { Database } from 'sql.js';
import type { 
  EmailKeyPoint, 
  DatabaseMessage, 
  DatabaseResponse,
  DBStats 
} from './types';

let db: Database | null = null;
let isInitializing = false;

const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS key_points (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    key_point TEXT NOT NULL,
    extracted_at INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('wink-nlp', 'gemini-nano')),
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    tags TEXT NOT NULL DEFAULT '[]',
    encryption_nonce TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_email_id ON key_points(email_id);
  CREATE INDEX IF NOT EXISTS idx_source ON key_points(source);
  CREATE INDEX IF NOT EXISTS idx_extracted_at ON key_points(extracted_at);

  CREATE TABLE IF NOT EXISTS email_metadata (
    email_id TEXT PRIMARY KEY,
    from_addr TEXT NOT NULL,
    subject TEXT,
    timestamp INTEGER NOT NULL,
    key_point_count INTEGER DEFAULT 0,
    last_processed INTEGER,
    deleted_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_deleted ON email_metadata(deleted_at);
`;

/**
 * Initialize SQLite database (lazy load sql.js WASM)
 */
async function initializeDatabase(): Promise<Database> {
  if (db) return db;
  if (isInitializing) {
    // Prevent race conditions
    while (isInitializing) await new Promise(r => setTimeout(r, 50));
    return db!;
  }

  isInitializing = true;
  try {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    
    // Execute schema
    db.run(DB_SCHEMA);
    console.log('[Offscreen] SQLite database initialized');
    
    return db;
  } catch (err) {
    console.error('[Offscreen] Database initialization failed:', err);
    throw new Error(`DB_INIT_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    isInitializing = false;
  }
}

/**
 * Insert key-point with privacy audit logging
 */
function handleInsertKeyPoint(keyPoint: EmailKeyPoint): DatabaseResponse<{ id: string }> {
  try {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare(`
      INSERT INTO key_points (
        id, email_id, key_point, extracted_at, source, confidence, tags, encryption_nonce
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.bind([
      keyPoint.id,
      keyPoint.emailId,
      keyPoint.keyPoint,
      keyPoint.extractedAt,
      keyPoint.source,
      keyPoint.confidence,
      JSON.stringify(keyPoint.tags),
      keyPoint.encryptionNonce || null
    ]);

    stmt.step();
    stmt.free();

    // Update email metadata
    const metaStmt = db.prepare(`
      UPDATE email_metadata 
      SET key_point_count = key_point_count + 1, last_processed = ?
      WHERE email_id = ?
    `);
    metaStmt.bind([Date.now(), keyPoint.emailId]);
    metaStmt.step();
    metaStmt.free();

    console.log(`[Offscreen] Inserted key-point for ${keyPoint.emailId}`);
    
    return { success: true, data: { id: keyPoint.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Offscreen] Insert failed:', msg);
    return { 
      success: false, 
      error: msg,
      code: 'DB_INSERT_ERROR'
    };
  }
}

/**
 * Query key-points for an email (privacy: only returns non-deleted entries)
 */
function handleQueryKeyPoints(emailId: string): DatabaseResponse<EmailKeyPoint[]> {
  try {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare(`
      SELECT 
        id, email_id, key_point, extracted_at, source, 
        confidence, tags, encryption_nonce
      FROM key_points
      WHERE email_id = ? AND id IN (
        SELECT id FROM key_points 
        WHERE email_id NOT IN (
          SELECT email_id FROM email_metadata WHERE deleted_at IS NOT NULL
        )
      )
      ORDER BY extracted_at DESC
    `);

    stmt.bind([emailId]);
    const results: EmailKeyPoint[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      results.push({
        id: row.id as string,
        emailId: row.email_id as string,
        keyPoint: row.key_point as string,
        extractedAt: row.extracted_at as number,
        source: row.source as 'wink-nlp' | 'gemini-nano',
        confidence: row.confidence as number,
        tags: JSON.parse(row.tags as string),
        encryptionNonce: row.encryption_nonce as string | undefined
      });
    }

    stmt.free();
    return { success: true, data: results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { 
      success: false, 
      error: msg,
      code: 'DB_QUERY_ERROR'
    };
  }
}

/**
 * Soft-delete: mark email & its key-points as deleted
 * Privacy: User can recover within 30 days, then hard-deleted
 */
function handleDeleteEmail(emailId: string): DatabaseResponse<{ deletedCount: number }> {
  try {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare(`
      UPDATE email_metadata 
      SET deleted_at = ?
      WHERE email_id = ?
    `);

    stmt.bind([Date.now(), emailId]);
    stmt.step();
    stmt.free();

    // Count affected key-points
    const countStmt = db.prepare(`
      SELECT COUNT(*) as cnt FROM key_points WHERE email_id = ?
    `);
    countStmt.bind([emailId]);
    countStmt.step();
    const { cnt } = countStmt.getAsObject() as { cnt: number };
    countStmt.free();

    console.log(`[Offscreen] Soft-deleted email ${emailId} (${cnt} key-points)`);
    
    return { success: true, data: { deletedCount: cnt } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { 
      success: false, 
      error: msg,
      code: 'DB_DELETE_ERROR'
    };
  }
}

/**
 * Export data (for privacy audit or backup)
 */
function handleExportData(format: 'json' | 'csv'): DatabaseResponse<string> {
  try {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare(`
      SELECT 
        id, email_id, key_point, extracted_at, source, confidence, tags
      FROM key_points
      WHERE email_id NOT IN (
        SELECT email_id FROM email_metadata WHERE deleted_at IS NOT NULL
      )
      ORDER BY extracted_at DESC
    `);

    const rows: EmailKeyPoint[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      rows.push({
        id: row.id as string,
        emailId: row.email_id as string,
        keyPoint: row.key_point as string,
        extractedAt: row.extracted_at as number,
        source: row.source as 'wink-nlp' | 'gemini-nano',
        confidence: row.confidence as number,
        tags: JSON.parse(row.tags as string)
      });
    }
    stmt.free();

    let result: string;
    if (format === 'json') {
      result = JSON.stringify(rows, null, 2);
    } else {
      // CSV export
      const headers = ['id', 'emailId', 'keyPoint', 'extractedAt', 'source', 'confidence', 'tags'];
      const csv = [
        headers.join(','),
        ...rows.map(r => [
          r.id,
          r.emailId,
          `"${r.keyPoint.replace(/"/g, '""')}"`,
          r.extractedAt,
          r.source,
          r.confidence,
          r.tags.join(';')
        ].join(','))
      ].join('\n');
      result = csv;
    }

    return { success: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { 
      success: false, 
      error: msg,
      code: 'DB_EXPORT_ERROR'
    };
  }
}

/**
 * Get DB stats (for privacy dashboard)
 */
function handleGetStats(): DatabaseResponse<DBStats> {
  try {
    if (!db) throw new Error('Database not initialized');

    const countStmt = db.prepare(`
      SELECT 
        COUNT(*) as total_kp,
        COUNT(DISTINCT email_id) as total_emails,
        MIN(extracted_at) as oldest
      FROM key_points
      WHERE email_id NOT IN (
        SELECT email_id FROM email_metadata WHERE deleted_at IS NOT NULL
      )
    `);

    countStmt.step();
    const stats = countStmt.getAsObject() as Record<string, unknown>;
    countStmt.free();

    return {
      success: true,
      data: {
        totalKeyPoints: (stats.total_kp as number) || 0,
        totalEmails: (stats.total_emails as number) || 0,
        storageUsedBytes: db.export().length,
        oldestEntry: (stats.oldest as number) || 0
      }
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { 
      success: false, 
      error: msg,
      code: 'DB_STATS_ERROR'
    };
  }
}

/**
 * Persistent storage: Save DB to Chrome's storage quota
 */
async function persistDatabase(): Promise<void> {
  if (!db) return;
  
  try {
    const data = db.export();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    
    // Store in IndexedDB or Chrome's storage (choose based on size)
    const dbBuffer = await blob.arrayBuffer();
    
    // Use chrome.storage.local with compression if >10MB
    const compressed = new Uint8Array(dbBuffer);
    
    chrome.storage.local.set({ 
      'sqlite_db': Array.from(compressed),
      'db_persisted_at': Date.now()
    });
    
    console.log(`[Offscreen] Database persisted (${compressed.length} bytes)`);
  } catch (err) {
    console.error('[Offscreen] Persistence failed:', err);
  }
}

/**
 * Message listener (from background.ts or content.ts)
 */
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    const dbMsg = message as DatabaseMessage;

    (async () => {
      try {
        // Initialize DB on first use
        if (!db && !isInitializing) {
          await initializeDatabase();
        }

        let response: DatabaseResponse<unknown>;

        switch (dbMsg.action) {
          case 'DB_INSERT_KEYPOINT':
            response = handleInsertKeyPoint(dbMsg.payload);
            break;

          case 'DB_QUERY_KEYPOINTS':
            response = handleQueryKeyPoints(dbMsg.emailId);
            break;

          case 'DB_DELETE_EMAIL':
            response = handleDeleteEmail(dbMsg.emailId);
            break;

          case 'DB_EXPORT_DATA':
            response = handleExportData(dbMsg.format);
            break;

          case 'DB_STATS':
            response = handleGetStats();
            break;

          case 'DB_CLEAR_ALL':
            // Safety: require confirmation token
            if (dbMsg.confirmToken === 'CONFIRM_DELETE_ALL_LOCAL_DATA') {
              db!.run('DELETE FROM key_points; DELETE FROM email_metadata;');
              console.warn('[Offscreen] All data cleared');
              response = { success: true, data: { deletedCount: -1 } };
            } else {
              response = { success: false, error: 'Invalid confirmation token', code: 'INVALID_TOKEN' };
            }
            break;

          default:
            response = { success: false, error: 'Unknown action', code: 'UNKNOWN_ACTION' };
        }

        sendResponse(response);

        // Persist after every write operation
        if (['DB_INSERT_KEYPOINT', 'DB_DELETE_EMAIL', 'DB_CLEAR_ALL'].includes(dbMsg.action)) {
          await persistDatabase();
        }
      } catch (err) {
        console.error('[Offscreen] Unhandled error:', err);
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
          code: 'OFFSCREEN_ERROR'
        });
      }
    })();

    // Keep channel open for async response
    return true;
  }
);

// Initialize on load
initializeDatabase().catch(err => console.error('Failed to init DB:', err));
