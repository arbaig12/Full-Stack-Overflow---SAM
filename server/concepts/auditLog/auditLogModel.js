/**
 * @file auditLogModel.js
 * @description This file defines the data model and database interactions for the Audit Log concept.
 * It includes functions for logging actions and retrieving audit trails.
 */

/**
 * Logs an action into the audit trail.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} logEntry - The details of the action to log.
 * @param {number} [logEntry.user_id] - The ID of the user who performed the action (optional, for system actions).
 * @param {string} logEntry.action_type - The type of action (e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN').
 * @param {string} logEntry.entity_type - The type of entity affected (e.g., 'User', 'Course', 'RegistrationHold').
 * @param {number} [logEntry.entity_id] - The ID of the entity affected (optional).
 * @param {object} [logEntry.old_value] - The old state of the entity (for UPDATE/DELETE).
 * @param {object} [logEntry.new_value] - The new state of the entity (for CREATE/UPDATE).
 * @param {string} [logEntry.change_details] - A human-readable description of the change.
 * @returns {Promise<object>} A promise that resolves to the newly created audit log entry.
 */
export async function logAction(db, logEntry) {
  const { user_id, action_type, entity_type, entity_id, old_value, new_value, change_details } = logEntry;
  const sql = `
    INSERT INTO audit_log_entries (user_id, action_type, entity_type, entity_id, old_value, new_value, change_details)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING log_id, user_id, action_type, entity_type, entity_id, old_value, new_value, change_details, timestamp
  `;
  const { rows } = await db.query(sql, [user_id, action_type, entity_type, entity_id, old_value, new_value, change_details]);
  return rows[0];
}

/**
 * Retrieves audit log entries, with optional filtering.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} [filters] - Optional filters for the audit log.
 * @param {number} [filters.user_id] - Filter by the user who performed the action.
 * @param {string} [filters.action_type] - Filter by the type of action.
 * @param {string} [filters.entity_type] - Filter by the type of entity affected.
 * @param {number} [filters.entity_id] - Filter by the ID of the entity affected.
 * @param {string} [filters.startDate] - Filter for entries after this date (ISO string).
 * @param {string} [filters.endDate] - Filter for entries before this date (ISO string).
 * @param {number} [filters.limit] - Limit the number of results.
 * @param {number} [filters.offset] - Offset for pagination.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of audit log entries.
 */
export async function getAuditLog(db, filters = {}) {
  let query = `
    SELECT
      log_id,
      user_id,
      action_type,
      entity_type,
      entity_id,
      old_value,
      new_value,
      change_details,
      timestamp
    FROM audit_log_entries
  `;
  const params = [];
  const conditions = [];
  let paramIndex = 0;

  if (filters.user_id) {
    paramIndex++;
    conditions.push(`user_id = $${paramIndex}`);
    params.push(filters.user_id);
  }
  if (filters.action_type) {
    paramIndex++;
    conditions.push(`action_type = $${paramIndex}`);
    params.push(filters.action_type);
  }
  if (filters.entity_type) {
    paramIndex++;
    conditions.push(`entity_type = $${paramIndex}`);
    params.push(filters.entity_type);
  }
  if (filters.entity_id) {
    paramIndex++;
    conditions.push(`entity_id = $${paramIndex}`);
    params.push(filters.entity_id);
  }
  if (filters.startDate) {
    paramIndex++;
    conditions.push(`timestamp >= $${paramIndex}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    paramIndex++;
    conditions.push(`timestamp <= $${paramIndex}`);
    params.push(filters.endDate);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  query += ` ORDER BY timestamp DESC`;

  if (filters.limit) {
    paramIndex++;
    query += ` LIMIT $${paramIndex}`;
    params.push(filters.limit);
  }
  if (filters.offset) {
    paramIndex++;
    query += ` OFFSET $${paramIndex}`;
    params.push(filters.offset);
  }

  const { rows } = await db.query(query, params);
  return rows;
}
