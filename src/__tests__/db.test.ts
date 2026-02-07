import { describe, it, expect, vi } from 'vitest';
import { handleDatabaseMessage } from '../lib/db';
import type { DatabaseMessage } from '../types/messages';

// Mock logger to avoid console noise
vi.mock('../lib/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock sql.js since WASM might not load in simple test env
vi.mock('sql.js', () => ({
  default: vi.fn().mockResolvedValue({
    Database: vi.fn().mockImplementation(() => ({
      run: vi.fn(),
      prepare: vi.fn(() => ({
        step: vi.fn(),
        getAsObject: vi.fn(() => ({ total_count: 0, last_processed: null })),
        free: vi.fn(),
      })),
      export: vi.fn(),
    })),
  }),
}));

describe('SQLite DB Handler', () => {
  it('should route INITIALIZE_DB correctly', async () => {
    const msg: DatabaseMessage = { type: 'DB/INITIALIZE_DB' };
    const res = await handleDatabaseMessage(msg);
    expect(res.success).toBe(true);
  });

  it('should route PING correctly', async () => {
    const msg: DatabaseMessage = { type: 'DB/PING' };
    const res = await handleDatabaseMessage(msg);
    expect(res.success).toBe(true);
    if (res.success) {
        expect((res.data as any).ok).toBe(true);
    }
  });

  it('should fail gracefully on unknown commands', async () => {
    const res = await handleDatabaseMessage({ type: 'DB/UNKNOWN' } as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('DB_UNKNOWN_COMMAND');
  });
});
