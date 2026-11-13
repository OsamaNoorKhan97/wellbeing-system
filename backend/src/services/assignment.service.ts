import { db, type Db } from '../db/pool';

export interface ManagerSummary {
  id: number;
  fullName: string;
  email: string;
}

export async function getActiveManager(employeeId: number, tx: Db = db): Promise<ManagerSummary | null> {
  const { rows } = await tx.query(
    `SELECT m.id, m.full_name AS "fullName", m.email
       FROM employee_manager_assignments a
       JOIN users m ON m.id = a.manager_id
      WHERE a.employee_id = $1 AND a.is_active AND m.is_active`,
    [employeeId],
  );
  return rows[0] ?? null;
}

export async function isAssignedTo(managerId: number, employeeId: number, tx: Db = db): Promise<boolean> {
  const { rows } = await tx.query(
    'SELECT 1 FROM employee_manager_assignments WHERE manager_id = $1 AND employee_id = $2 AND is_active',
    [managerId, employeeId],
  );
  return rows.length > 0;
}
