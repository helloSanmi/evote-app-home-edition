const fs = require("fs");
const path = require("path");
const { q } = require("./db");

function splitSqlStatements(sql) {
  const cleaned = sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter(Boolean)
    .join("\n");

  return cleaned
    .split(/;\s*(?:\r?\n|$)/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ensureBaseSchema() {
  const schemaPath = path.join(__dirname, "DBRelated", "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.warn("[db] schema.sql not found; skipping base schema bootstrap");
    return;
  }

  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const statements = splitSqlStatements(schemaSql);
  for (const statement of statements) {
    await q(statement);
  }
}

async function ensureRoleColumn() {
  const [[roleColumn]] = await q(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='Users' AND COLUMN_NAME='role'`
  );
  if (!roleColumn) {
    await q(`ALTER TABLE Users ADD COLUMN role VARCHAR(30) NOT NULL DEFAULT 'user'`);
    await q(`UPDATE Users SET role='user' WHERE role IS NULL`);
  } else {
    await q(`ALTER TABLE Users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'user'`);
  }

  await q(`ALTER TABLE Users MODIFY COLUMN isAdmin TINYINT(1) NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE Users MODIFY COLUMN hasVoted TINYINT(1) NOT NULL DEFAULT 0`);
}

async function ensureChatStatusColumn() {
  const [[statusColumn]] = await q(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='Users' AND COLUMN_NAME='chatStatus'`
  );
  if (!statusColumn) {
    await q(`ALTER TABLE Users ADD COLUMN chatStatus VARCHAR(10) NOT NULL DEFAULT 'offline' AFTER isAdmin`);
    await q(`UPDATE Users SET chatStatus='offline' WHERE chatStatus IS NULL OR chatStatus=''`);
  } else {
    await q(`ALTER TABLE Users MODIFY COLUMN chatStatus VARCHAR(10) NOT NULL DEFAULT 'offline'`);
    await q(`UPDATE Users SET chatStatus='offline' WHERE chatStatus IS NULL OR chatStatus=''`);
  }
}

async function ensureGoogleIdColumn() {
  const [[googleColumn]] = await q(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='Users' AND COLUMN_NAME='googleId'`
  );
  if (!googleColumn) {
    await q(`ALTER TABLE Users ADD COLUMN googleId VARCHAR(64) NULL UNIQUE AFTER chatStatus`);
  }
}

async function ensureMicrosoftIdColumn() {
  const [[azureColumn]] = await q(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='Users' AND COLUMN_NAME='microsoftId'`
  );
  if (!azureColumn) {
    await q(`ALTER TABLE Users ADD COLUMN microsoftId VARCHAR(64) NULL UNIQUE AFTER googleId`);
  }
}

async function ensureIndex(table, indexName, sql) {
  const [[exists]] = await q(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?`,
    [table, indexName]
  );
  if (!exists) {
    await q(sql);
  }
}

async function ensureUserLifecycleColumns() {
  const lifecycleColumns = [
    { name: "lastLoginAt", sql: "ALTER TABLE Users ADD COLUMN lastLoginAt DATETIME NULL AFTER profilePhoto" },
    { name: "deletedAt", sql: "ALTER TABLE Users ADD COLUMN deletedAt DATETIME NULL AFTER lastLoginAt" },
    { name: "purgeAt", sql: "ALTER TABLE Users ADD COLUMN purgeAt DATETIME NULL AFTER deletedAt" },
    { name: "restoreToken", sql: "ALTER TABLE Users ADD COLUMN restoreToken VARCHAR(128) NULL AFTER purgeAt" },
  ];

  for (const column of lifecycleColumns) {
    const [[exists]] = await q(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='Users' AND COLUMN_NAME=?`,
      [column.name]
    );
    if (!exists) {
      await q(column.sql);
    }
  }

  await ensureIndex("Users", "idx_users_deleted", "ALTER TABLE Users ADD KEY idx_users_deleted (deletedAt)");
  await ensureIndex("Users", "idx_users_purge", "ALTER TABLE Users ADD KEY idx_users_purge (purgeAt)");
  await ensureIndex("Users", "idx_users_last_login", "ALTER TABLE Users ADD KEY idx_users_last_login (lastLoginAt)");
}

async function ensureChatTables() {
  await q(`
    CREATE TABLE IF NOT EXISTS ChatSession (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NULL,
      userName VARCHAR(200) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      assignedAdminId INT NULL,
      assignedAdminName VARCHAR(200) NULL,
      lastMessageAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chatsession_user FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE SET NULL,
      CONSTRAINT fk_chatsession_admin FOREIGN KEY (assignedAdminId) REFERENCES Users(id) ON DELETE SET NULL,
      KEY idx_chatsession_status (status, lastMessageAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS ChatMessage (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sessionId INT NOT NULL,
      senderType VARCHAR(20) NOT NULL,
      senderId INT NULL,
      senderName VARCHAR(200) NULL,
      body TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chatmessage_session FOREIGN KEY (sessionId) REFERENCES ChatSession(id) ON DELETE CASCADE,
      KEY idx_chatmessage_session (sessionId, createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS ChatGuestToken (
      sessionId INT NOT NULL PRIMARY KEY,
      token VARCHAR(200) NOT NULL UNIQUE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chatguesttoken_session FOREIGN KEY (sessionId) REFERENCES ChatSession(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function envSet(value) {
  return new Set((value || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

async function ensureRequestLogColumns() {
  const columns = [
    { name: "statusCode", sql: "ALTER TABLE RequestLogs ADD COLUMN statusCode INT NULL AFTER ip" },
    { name: "durationMs", sql: "ALTER TABLE RequestLogs ADD COLUMN durationMs INT NULL AFTER statusCode" },
    { name: "queryParams", sql: "ALTER TABLE RequestLogs ADD COLUMN queryParams TEXT NULL AFTER durationMs" },
    { name: "bodyParams", sql: "ALTER TABLE RequestLogs ADD COLUMN bodyParams TEXT NULL AFTER queryParams" },
  ];

  for (const column of columns) {
    const [[exists]] = await q(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='RequestLogs' AND COLUMN_NAME=?`,
      [column.name]
    );
    if (!exists) {
      await q(column.sql);
    }
  }
}

async function ensureAuditLogTable() {
  await q(`
    CREATE TABLE IF NOT EXISTS AuditLog (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      actorId INT NULL,
      actorRole VARCHAR(30) NULL,
      action VARCHAR(120) NOT NULL,
      entityType VARCHAR(60) NOT NULL,
      entityId VARCHAR(120) NULL,
      beforeState JSON NULL,
      afterState JSON NULL,
      ip VARCHAR(64) NULL,
      notes VARCHAR(500) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_auditlog_actor FOREIGN KEY (actorId) REFERENCES Users(id) ON DELETE SET NULL,
      KEY idx_auditlog_created (createdAt),
      KEY idx_auditlog_actor (actorId),
      KEY idx_auditlog_entity (entityType, entityId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureIdentityColumns() {
  const columns = [
    { name: "firstName", sql: "ALTER TABLE Users ADD COLUMN firstName VARCHAR(60) NULL AFTER fullName" },
    { name: "lastName", sql: "ALTER TABLE Users ADD COLUMN lastName VARCHAR(60) NULL AFTER firstName" },
    { name: "gender", sql: "ALTER TABLE Users ADD COLUMN gender VARCHAR(20) NULL AFTER dateOfBirth" },
    { name: "nationalId", sql: "ALTER TABLE Users ADD COLUMN nationalId VARCHAR(30) NULL AFTER gender" },
    { name: "voterCardNumber", sql: "ALTER TABLE Users ADD COLUMN voterCardNumber VARCHAR(30) NULL AFTER nationalId" },
    { name: "residenceAddress", sql: "ALTER TABLE Users ADD COLUMN residenceAddress VARCHAR(255) NULL AFTER voterCardNumber" },
  ];

  for (const column of columns) {
    const [[exists]] = await q(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='Users' AND COLUMN_NAME=?`,
      [column.name]
    );
    if (!exists) {
      await q(column.sql);
    }
  }

  await q(`
    UPDATE Users
    SET
      firstName = CASE
        WHEN (firstName IS NULL OR firstName = '')
          THEN NULLIF(TRIM(SUBSTRING_INDEX(fullName, ' ', 1)), '')
        ELSE firstName
      END,
      lastName = CASE
        WHEN (lastName IS NULL OR lastName = '')
          THEN NULLIF(
            TRIM(
              CASE
                WHEN fullName LIKE '% %' THEN SUBSTRING(fullName, LOCATE(' ', fullName) + 1)
                ELSE fullName
              END
            ), ''
          )
        ELSE lastName
      END
    WHERE fullName IS NOT NULL
  `);

  await ensureIndex("Users", "uq_users_nationalId", "ALTER TABLE Users ADD UNIQUE KEY uq_users_nationalId (nationalId)");
  await ensureIndex("Users", "uq_users_voterCard", "ALTER TABLE Users ADD UNIQUE KEY uq_users_voterCard (voterCardNumber)");
}

async function ensureNotificationTables() {
  await q(`
    CREATE TABLE IF NOT EXISTS NotificationEvent (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(60) NOT NULL,
      title VARCHAR(200) NOT NULL,
      message TEXT NULL,
      audience VARCHAR(20) NOT NULL DEFAULT 'user',
      scope VARCHAR(20) NOT NULL DEFAULT 'global',
      scopeState VARCHAR(120) NULL,
      scopeLGA VARCHAR(120) NULL,
      periodId INT NULL,
      metadata JSON NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_notification_created (createdAt),
      KEY idx_notification_scope (scope, scopeState, scopeLGA),
      KEY idx_notification_period (periodId),
      CONSTRAINT fk_notification_period FOREIGN KEY (periodId) REFERENCES VotingPeriod(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [[audienceColumn]] = await q(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'NotificationEvent'
        AND COLUMN_NAME = 'audience'`
  );
  if (!audienceColumn) {
    await q(`ALTER TABLE NotificationEvent ADD COLUMN audience VARCHAR(20) NOT NULL DEFAULT 'user' AFTER message`);
  }

  await ensureIndex("NotificationEvent", "idx_notification_audience", "ALTER TABLE NotificationEvent ADD KEY idx_notification_audience (audience)");

  await q(`
    CREATE TABLE IF NOT EXISTS NotificationReceipt (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      notificationId BIGINT NOT NULL,
      userId INT NOT NULL,
      readAt DATETIME NULL,
      clearedAt DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_notification_user (notificationId, userId),
      KEY idx_receipt_user (userId, createdAt),
      CONSTRAINT fk_receipt_notification FOREIGN KEY (notificationId) REFERENCES NotificationEvent(id) ON DELETE CASCADE,
      CONSTRAINT fk_receipt_user FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function alignRolesWithFlags() {
  const adminUsernames = envSet(process.env.ADMIN_USERNAMES);
  const adminEmails = envSet(process.env.ADMIN_EMAILS);

  if (adminUsernames.size || adminEmails.size) {
    const clauses = [];
    const params = [];
    if (adminUsernames.size) {
      clauses.push(`LOWER(username) IN (${Array.from(adminUsernames).map(() => "?").join(",")})`);
      params.push(...adminUsernames);
    }
    if (adminEmails.size) {
      clauses.push(`LOWER(email) IN (${Array.from(adminEmails).map(() => "?").join(",")})`);
      params.push(...adminEmails);
    }
    const whereClause = clauses.join(" OR ");
    await q(
      `UPDATE Users SET role='super-admin', isAdmin=1 WHERE ${whereClause}`,
      params
    );
  }

  await q(
    `UPDATE Users
     SET role='admin', isAdmin=1
     WHERE role NOT IN ('admin','super-admin') AND (isAdmin=1)`
  );

  await q(
    `UPDATE Users
     SET role='user', isAdmin=0
     WHERE role NOT IN ('admin','super-admin') AND (isAdmin=0 OR role IS NULL)`
  );
}

async function ensureSchema() {
  await ensureBaseSchema();
  await ensureRoleColumn();
  await ensureChatStatusColumn();
  await ensureGoogleIdColumn();
  await ensureMicrosoftIdColumn();
  await ensureIdentityColumns();
  await ensureUserLifecycleColumns();
  await ensureChatTables();
  await alignRolesWithFlags();
  await ensureRequestLogColumns();
  await ensureAuditLogTable();
  await ensureNotificationTables();
}

module.exports = { ensureSchema };
