const { q } = require("./db");

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
  await ensureRoleColumn();
  await ensureChatTables();
  await alignRolesWithFlags();
}

module.exports = { ensureSchema };
