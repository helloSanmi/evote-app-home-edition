const { q } = require("../db");

function toJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function recordAuditEvent({
  actorId = null,
  actorRole = null,
  action,
  entityType,
  entityId = null,
  before = null,
  after = null,
  ip = null,
  notes = null,
}) {
  if (!action || !entityType) return;
  try {
    await q(
      `INSERT INTO AuditLog (actorId, actorRole, action, entityType, entityId, beforeState, afterState, ip, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        actorId,
        actorRole || null,
        action,
        entityType,
        entityId,
        toJson(before),
        toJson(after),
        ip ? String(ip).slice(0, 64) : null,
        notes ? String(notes).slice(0, 500) : null,
      ]
    );
  } catch (err) {
    console.error("audit:record", err?.message || err);
  }
}

module.exports = { recordAuditEvent };
