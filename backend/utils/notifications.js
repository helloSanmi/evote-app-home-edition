const { q } = require("../db");

const VALID_SCOPES = new Set(["global", "national", "state", "local"]);

function sanitizeScope(scope) {
  const normalized = (scope || "").toLowerCase();
  return VALID_SCOPES.has(normalized) ? normalized : "global";
}

function parseMetadata(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeRecipients(userIds) {
  if (!Array.isArray(userIds)) return [];
  return Array.from(
    new Set(
      userIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    scope: sanitizeScope(row.scope),
    scopeState: row.scopeState || null,
    scopeLGA: row.scopeLGA || null,
    periodId: row.periodId || null,
    metadata: parseMetadata(row.metadata),
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    readAt: row.readAt ? new Date(row.readAt) : null,
    clearedAt: row.clearedAt ? new Date(row.clearedAt) : null,
  };
}

async function persistNotification(event) {
  const scope = sanitizeScope(event.scope);
  const [result] = await q(
    `INSERT INTO NotificationEvent (type, title, message, scope, scopeState, scopeLGA, periodId, metadata)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      event.type,
      event.title,
      event.message || null,
      scope,
      scope !== "global" ? event.scopeState || null : null,
      scope === "local" ? event.scopeLGA || null : (scope === "state" ? null : null),
      event.periodId || null,
      event.metadata ? JSON.stringify(event.metadata) : null,
    ]
  );
  const insertedId = result?.insertId;
  if (!insertedId) throw new Error("Failed to persist notification event");
  const [[row]] = await q(
    `SELECT id, type, title, message, scope, scopeState, scopeLGA, periodId, metadata, createdAt
     FROM NotificationEvent WHERE id=? LIMIT 1`,
    [insertedId]
  );
  return mapRow(row);
}

function emitNotification(io, notification, userIds) {
  if (!io || !notification) return;
  const recipients = normalizeRecipients(userIds);
  if (recipients.length) {
    recipients.forEach((userId) => {
      io.to(`user:${userId}`).emit("notification:new", notification);
    });
  } else {
    io.emit("notification:new", notification);
  }
}

async function notify(io, event, options = {}) {
  if (!event?.type || !event?.title) {
    throw new Error("Notification requires at least type and title");
  }
  const notification = await persistNotification(event);
  emitNotification(io, notification, options.userIds || event.userIds);
  return notification;
}

module.exports = {
  notify,
  persistNotification,
  emitNotification,
  mapRow,
};
