import { Router } from 'express';
import { db, withTransaction } from '../../db/pool';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { ipOf, recordAudit } from '../../services/audit.service';
import { settingDefinitions, type SettingKey } from '../../services/settings.service';
import { AppError, asyncHandler, ok } from '../../utils/http';

async function listSettings() {
  const { rows } = await db.query(
    `SELECT s.key, s.value, s.description, s.updated_at AS "updatedAt", u.full_name AS "updatedByName"
       FROM application_settings s LEFT JOIN users u ON u.id = s.updated_by ORDER BY s.id`,
  );
  return rows.map((row) => ({ ...row, label: settingDefinitions[row.key as SettingKey]?.label ?? row.key }));
}

export const settingsRouter = Router();
settingsRouter.use(authenticate, authorize('HR_ADMIN'));

settingsRouter.get('/', asyncHandler(async (_req, res) => ok(res, await listSettings())));

settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: { field: string; message: string }[] = [];
    const changes: { key: SettingKey; value: string }[] = [];

    for (const [key, raw] of Object.entries(body)) {
      const definition = settingDefinitions[key as SettingKey];
      if (!definition) {
        errors.push({ field: key, message: 'Unknown setting' });
        continue;
      }
      const result = definition.schema.safeParse(raw);
      if (!result.success) errors.push({ field: key, message: result.error.issues[0].message });
      else changes.push({ key: key as SettingKey, value: String(result.data) });
    }

    const timezone = changes.find((c) => c.key === 'organization_timezone');
    if (timezone) {
      const known = await db.query('SELECT 1 FROM pg_timezone_names WHERE name = $1', [timezone.value]);
      if (known.rows.length === 0) errors.push({ field: 'organization_timezone', message: 'Unknown time zone. Use an IANA name such as Asia/Karachi.' });
    }
    if (changes.length === 0 && errors.length === 0) errors.push({ field: '', message: 'No settings were provided' });
    if (errors.length > 0) throw new AppError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields', errors);

    const actor = currentUser(req);
    await withTransaction(async (tx) => {
      for (const change of changes) {
        const previous = await tx.query('SELECT value FROM application_settings WHERE key = $1', [change.key]);
        if (previous.rows[0]?.value === change.value) continue;
        await tx.query('UPDATE application_settings SET value = $2, updated_by = $3 WHERE key = $1', [change.key, change.value, actor.id]);
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'SETTING_UPDATED',
          entityType: 'application_setting',
          details: { key: change.key, from: previous.rows[0]?.value ?? null, to: change.value },
          ip: ipOf(req),
        });
      }
    });
    ok(res, await listSettings());
  }),
);
