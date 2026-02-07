# SQLite Integration: Privacy-First Key-Point Storage

## Overview

This branch (`feat/sqlite-integration`) adds persistent, local SQLite storage for email key-points extracted by Gmail TLDR. Data stays on-device with comprehensive privacy controls.

## Architecture

```
Content Script (Gmail DOM)
       ↓
Service Worker (background.ts)
       ↓
Offscreen Document (offscreen.ts)
       ↓
SQLite Database (sql.js in WASM)
```

**Design Principles:**
- **KISS (Keep It Simple, Stupid):** Single Offscreen document handles all persistence
- **YAGNI (You Aren't Gonna Need It):** No unnecessary complexity—just what's needed for privacy + storage
- **Type-Safe:** Discriminated unions (TypeScript) ensure correct message structure
- **Privacy-First:** Soft deletes, retention policies, audit logging built-in

## Key Files

### Core SQLite Layer

| File | Purpose |
|------|----------|
| `src/offscreen.ts` | SQLite manager, message handler, persistence logic |
| `src/types/db.ts` | TypeScript interfaces: `EmailKeyPoint`, `EmailMetadata`, `DBStats` |
| `src/types/messages.ts` | Discriminated union types for type-safe messaging |
| `static/offscreen.html` | Offscreen document that hosts the DB |

### Service Worker Integration

| File | Purpose |
|------|----------|
| `src/background-db-integration.ts` | Helper functions: `sendDatabaseCommand()`, `storeEmailKeyPoint()`, etc. |
| `src/utils/privacy-audit.ts` | Audit logging, data retention, privacy dashboard |

### Configuration

| File | Changes |
|------|----------|
| `manifest.json` | Added `offscreen_documents`, `alarms` permission |
| `vite.config.ts` | Optimized `sql.js` bundling |

## Usage Example

### From Service Worker (background.ts)

```typescript
import { storeEmailKeyPoint, getDBStats } from './background-db-integration';

// After extracting key-point from email
await storeEmailKeyPoint(
  'msg-12345',
  'Project Deadline',
  'Must deliver MVP by Friday',
  'wink-nlp',
  0.95,
  ['deadline', 'actionable']
);

// Query stats for privacy dashboard
const stats = await getDBStats();
console.log(`Stored ${stats.totalKeyPoints} key-points`);
```

### Direct Message Passing

```typescript
// If you need low-level control
const response = await chrome.runtime.sendMessage({
  action: 'DB_INSERT_KEYPOINT',
  payload: {
    id: crypto.randomUUID(),
    emailId: 'msg-123',
    keyPoint: 'Follow up with Sarah',
    extractedAt: Date.now(),
    source: 'wink-nlp',
    confidence: 0.92,
    tags: ['follow-up']
  }
});

if (response.success) {
  console.log('Stored:', response.data.id);
} else {
  console.error('Error:', response.error, response.code);
}
```

## Data Model

### key_points Table

```sql
CREATE TABLE key_points (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL,
  key_point TEXT NOT NULL,
  extracted_at INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('wink-nlp', 'gemini-nano')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  tags TEXT NOT NULL DEFAULT '[]',           -- JSON array
  encryption_nonce TEXT,                     -- For future encryption
  created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indices for query performance
CREATE INDEX idx_email_id ON key_points(email_id);
CREATE INDEX idx_source ON key_points(source);
CREATE INDEX idx_extracted_at ON key_points(extracted_at);
```

### email_metadata Table

```sql
CREATE TABLE email_metadata (
  email_id TEXT PRIMARY KEY,
  from_addr TEXT NOT NULL,
  subject TEXT,
  timestamp INTEGER NOT NULL,
  key_point_count INTEGER DEFAULT 0,
  last_processed INTEGER,
  deleted_at INTEGER                        -- Soft delete timestamp
);

CREATE INDEX idx_deleted ON email_metadata(deleted_at);
```

## Privacy & Data Controls

### 1. Soft Deletes
When a user deletes an email, we mark it `deleted_at` instead of hard-deleting. This allows 30-day recovery windows and complies with data minimization principles.

```typescript
// Soft delete
await deleteEmailData('msg-123');

// Query automatically filters soft-deleted entries
// User can still recover within 30 days
```

### 2. Data Retention Policy

Auto-delete entries older than 90 days:

```typescript
import { enforceDataRetention } from './utils/privacy-audit';

// Initialize retention policy (runs daily)
await enforceDataRetention(90); // 90 days
```

### 3. Audit Logging

Every DB operation is logged for transparency:

```typescript
import { getAuditLog } from './utils/privacy-audit';

// Get last 1000 operations
const logs = getAuditLog();
console.log(logs);
// [
//   { timestamp: 1234567890, action: 'DB_INSERT_KEYPOINT', result: 'success' },
//   { timestamp: 1234567891, action: 'DB_QUERY_KEYPOINTS', result: 'success' },
//   ...
// ]
```

### 4. Export & Transparency

Users can export all their data in JSON or CSV:

```typescript
import { exportData } from './background-db-integration';

// Export as JSON
const json = await exportData('json');
const blob = new Blob([json], { type: 'application/json' });
const url = URL.createObjectURL(blob);
// Trigger download or show to user

// Export as CSV
const csv = await exportData('csv');
```

### 5. Privacy Dashboard

```typescript
import { getPrivacyDashboard } from './utils/privacy-audit';

const dashboard = await getPrivacyDashboard(90);
console.log({
  totalKeyPoints: dashboard.totalKeyPoints,
  totalEmails: dashboard.totalEmails,
  storageUsedMB: dashboard.storageUsedMB,
  oldestDataDate: dashboard.oldestDataDate,
  recentOperations: dashboard.recentOperations,
  dataRetentionDays: 90
});
```

## Performance Considerations

### sql.js WASM Size
- ~600KB gzipped (acceptable for Chrome extension)
- Lazy-loads on first DB access
- Database stays in memory (not ideal for >10MB, but reasonable for email key-points)

### Storage Limits
- `chrome.storage.local`: 10MB quota per extension
- Current model: in-memory SQLite exported to storage on write
- Safe for ~50k key-points (typical use case: 100–500 per user)

### Index Strategy
- Indexed on `email_id`, `source`, `extracted_at`
- Ensures O(log n) lookups for common queries
- Avoid full-table scans

## Error Handling

All database operations return typed responses:

```typescript
type DatabaseResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
```

**Common Error Codes:**
- `DB_INIT_FAILED` – SQL.js initialization failed
- `DB_INSERT_ERROR` – Insert constraint violation
- `DB_QUERY_ERROR` – Query syntax error
- `DB_DELETE_ERROR` – Delete operation failed
- `OFFSCREEN_ERROR` – Offscreen document crashed
- `INVALID_TOKEN` – Confirmation token mismatch (for `DB_CLEAR_ALL`)

## Testing

Example test structure:

```typescript
// src/__tests__/offscreen.test.ts
describe('SQLite Offscreen', () => {
  it('should insert and query key-points', async () => {
    const kp: EmailKeyPoint = {
      id: 'test-1',
      emailId: 'msg-123',
      keyPoint: 'Action item',
      extractedAt: Date.now(),
      source: 'wink-nlp',
      confidence: 0.95,
      tags: ['actionable']
    };

    // Mock chrome.runtime.sendMessage
    const response = await sendMessage({
      action: 'DB_INSERT_KEYPOINT',
      payload: kp
    });

    expect(response.success).toBe(true);
    expect(response.data.id).toBe('test-1');
  });
});
```

## Troubleshooting

### Offscreen document won't initialize

1. Check `manifest.json` has `offscreen_documents` array
2. Verify `offscreen_documents[0].reasons` includes `WORKERS`
3. Check browser console for `[Offscreen] SQLite database initialized`

### Data not persisting

1. Verify `persistDatabase()` is called after writes
2. Check `chrome.storage.local` quota with `chrome.storage.local.getBytesInUse()`
3. Ensure Offscreen document is not immediately destroyed

### Type errors in TypeScript

1. Ensure all messages match `DatabaseMessage` discriminated union
2. Import types from `src/types/messages.ts`
3. Use strict mode in `tsconfig.json`

## Future Enhancements

- [ ] **Encryption at rest:** ChaCha20-Poly1305 for sensitive data
- [ ] **Cloud sync:** Optional end-to-end encrypted sync to user's account
- [ ] **Full-text search:** Index key-point content for fast retrieval
- [ ] **Analytics:** Privacy-preserving stats (e.g., "most common tags")
- [ ] **Backup/Restore:** User-initiated backups with passphrase protection

## References

- [sql.js Documentation](https://sql.js.org/)
- [Chrome MV3 Offscreen Documents](https://developer.chrome.com/docs/extensions/mv3/offscreen_documents/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [OWASP Data Retention Guidelines](https://owasp.org/)

---

**Questions?** Check the code comments or open an issue on GitHub.
