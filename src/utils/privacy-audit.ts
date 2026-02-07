/**
 * Audit trail for privacy compliance
 */
export interface AuditLog {
  timestamp: number;
  action: string;
  emailId?: string;
  result: 'success' | 'error';
  details?: string;
}

const auditLogs: AuditLog[] = [];
const MAX_AUDIT_LOGS = 1000; // Keep last 1000 operations

/**
 * Log all DB operations for privacy compliance audit
 */
export function logAuditEvent(
  action: string,
  result: 'success' | 'error',
  emailId?: string,
  details?: string
): void {
  auditLogs.push({
    timestamp: Date.now(),
    action,
    emailId,
    result,
    details
  });

  if (auditLogs.length > MAX_AUDIT_LOGS) {
    auditLogs.shift();
  }

  // Persist to chrome.storage.session (cleared on browser close)
  chrome.storage.session.set({ auditLogs });
}

/**
 * Retrieve audit log for inspection
 */
export function getAuditLog(): AuditLog[] {
  return [...auditLogs];
}

/**
 * Data retention policy: Auto-delete after configured retention days
 */
export async function enforceDataRetention(
  retentionDays: number = 90
): Promise<void> {
  const RETENTION_MS = retentionDays * 24 * 60 * 60 * 1000;
  const ALARM_NAME = 'cleanup-old-data';

  // Schedule cleanup to run daily
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 24 * 60 });
  
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
      const cutoff = Date.now() - RETENTION_MS;
      console.log(
        `[Privacy] Running data retention cleanup (cutoff: ${new Date(cutoff).toISOString()})`
      );

      // Message the offscreen document to delete old entries
      try {
        chrome.runtime.sendMessage({
          action: 'DB_DELETE_BEFORE',
          timestamp: cutoff
        });
      } catch (err) {
        console.error('[Privacy] Cleanup job failed:', err);
      }
    }
  });
}

/**
 * Privacy dashboard: aggregate stats for user visibility
 */
export interface PrivacyDashboard {
  totalStoredKeyPoints: number;
  totalEmails: number;
  storageUsedMB: number;
  oldestDataDate: string | null;
  recentOperations: AuditLog[];
  dataRetentionDays: number;
  lastCleanupAt: number | null;
}

export async function getPrivacyDashboard(
  retentionDays: number = 90
): Promise<PrivacyDashboard> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'DB_STATS' },
      (response: any) => {
        const recent = auditLogs.slice(-20);
        
        resolve({
          totalStoredKeyPoints: response?.data?.totalKeyPoints ?? 0,
          totalEmails: response?.data?.totalEmails ?? 0,
          storageUsedMB: (response?.data?.storageUsedBytes ?? 0) / (1024 * 1024),
          oldestDataDate: response?.data?.oldestEntry 
            ? new Date(response.data.oldestEntry).toISOString() 
            : null,
          recentOperations: recent,
          dataRetentionDays: retentionDays,
          lastCleanupAt: null
        });
      }
    );
  });
}
