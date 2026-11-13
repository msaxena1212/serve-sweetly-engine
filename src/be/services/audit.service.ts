// Backend Audit Service: immutable audit logging for POS events
import { db } from '../../lib/db/db';
import { sql } from 'drizzle-orm';

export interface AuditLogEntry {
  entityType: 'order' | 'table' | 'payment' | 'inventory' | 'shift' | 'menu';
  entityId: string;
  action: 'create' | 'update' | 'void' | 'settle' | 'split' | 'transfer' | 'merge' | 'discount' | 'refund';
  userId?: number | null;
  branchId?: string;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  reason?: string | null;
  correlationId?: string;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO audit_logs (
        entity_type, entity_id, action, user_id, branch_id, before_snapshot, after_snapshot, reason, correlation_id
      ) VALUES (
        ${entry.entityType},
        ${entry.entityId},
        ${entry.action},
        ${entry.userId ?? null},
        ${entry.branchId || 'br-1'},
        ${entry.beforeSnapshot ? JSON.stringify(entry.beforeSnapshot) : null}::jsonb,
        ${entry.afterSnapshot ? JSON.stringify(entry.afterSnapshot) : null}::jsonb,
        ${entry.reason || null},
        ${entry.correlationId || null}
      )
    `);
  } catch (err) {
    // Audit write fallback: log to console so POS operation is never blocked by audit table differences
    console.warn('[AUDIT LOG]:', JSON.stringify(entry), 'Error writing to DB:', err);
  }
}

export async function getRecentAuditLogs(limit = 50) {
  try {
    const rows = await db.execute(sql`
      SELECT id, entity_type, entity_id, action, user_id, branch_id, reason, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return rows;
  } catch {
    return [];
  }
}
