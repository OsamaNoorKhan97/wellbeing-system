import type { Request } from 'express';
import type { Db } from '../db/pool';

export interface AuditEntry {
  actorId: number | null;
  action: string;
  entityType?: string;
  entityId?: number | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(tx: Db, entry: AuditEntry): Promise<void> {
  await tx.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [entry.actorId, entry.action, entry.entityType ?? null, entry.entityId ?? null, JSON.stringify(entry.details ?? {}), entry.ip ?? null],
  );
}

export const ipOf = (req: Request): string | null => req.ip ?? null;
