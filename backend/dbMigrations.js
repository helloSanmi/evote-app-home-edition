const { q } = require("./db");

async function ensureRoleColumn() {
  const [[column]] = await q(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='Users' AND COLUMN_NAME='role'
  `);
  if (!column) {
    await q(`ALTER TABLE Users ADD role NVARCHAR(30) NOT NULL CONSTRAINT DF_Users_role DEFAULT 'user'`);
    await q(`UPDATE Users SET role='user' WHERE role IS NULL`);
  }

  // Ensure default constraint exists (in case older constraint missing)
  await q(`IF NOT EXISTS (
      SELECT 1
      FROM sys.default_constraints
      WHERE parent_object_id = OBJECT_ID('Users')
        AND COL_NAME(parent_object_id, parent_column_id) = 'role'
    )
    BEGIN
      ALTER TABLE Users ADD CONSTRAINT DF_Users_role DEFAULT 'user' FOR role;
    END`);
}

async function ensureChatTables() {
  await q(`
    IF OBJECT_ID('dbo.ChatSession', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ChatSession (
        id INT IDENTITY(1,1) PRIMARY KEY,
        userId INT NULL,
        userName NVARCHAR(200) NULL,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_ChatSession_Status DEFAULT 'pending',
        assignedAdminId INT NULL,
        assignedAdminName NVARCHAR(200) NULL,
        lastMessageAt DATETIME2 NOT NULL CONSTRAINT DF_ChatSession_lastMessageAt DEFAULT SYSUTCDATETIME(),
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_ChatSession_createdAt DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_ChatSession_Status ON dbo.ChatSession(status, lastMessageAt DESC);
    END;
  `);

  await q(`
    IF OBJECT_ID('dbo.ChatMessage', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ChatMessage (
        id INT IDENTITY(1,1) PRIMARY KEY,
        sessionId INT NOT NULL,
        senderType NVARCHAR(20) NOT NULL,
        senderId INT NULL,
        senderName NVARCHAR(200) NULL,
        body NVARCHAR(MAX) NOT NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_ChatMessage_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ChatMessage_Session FOREIGN KEY (sessionId) REFERENCES dbo.ChatSession(id) ON DELETE CASCADE
      );
      CREATE INDEX IX_ChatMessage_Session ON dbo.ChatMessage(sessionId, createdAt DESC);
    END;
  `);

  await q(`
    IF OBJECT_ID('dbo.ChatGuestToken', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ChatGuestToken (
        sessionId INT NOT NULL PRIMARY KEY,
        token NVARCHAR(200) NOT NULL UNIQUE,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_ChatGuestToken_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ChatGuestToken_Session FOREIGN KEY (sessionId) REFERENCES dbo.ChatSession(id) ON DELETE CASCADE
      );
    END;
  `);
}

function envSet(value) {
  return new Set((value || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

async function alignRolesWithFlags() {
  const adminUsernames = envSet(process.env.ADMIN_USERNAMES);
  const adminEmails = envSet(process.env.ADMIN_EMAILS);

  if (adminUsernames.size || adminEmails.size) {
    const usernameList = Array.from(adminUsernames).map(() => "?").join(",");
    const emailList = Array.from(adminEmails).map(() => "?").join(",");
    const params = [...adminUsernames, ...adminEmails];
    const baseQuery = [];
    if (adminUsernames.size) baseQuery.push(`LOWER(username) IN (${usernameList})`);
    if (adminEmails.size) baseQuery.push(`LOWER(email) IN (${emailList})`);
    const whereClause = baseQuery.join(" OR ");
    await q(
      `UPDATE Users SET role='super-admin', isAdmin=1 WHERE ${whereClause}`,
      params
    );
  }

  await q(`UPDATE Users SET role='admin', isAdmin=1 WHERE role NOT IN ('admin','super-admin') AND (isAdmin=1 OR isAdmin='1')`);
  await q(`UPDATE Users SET role='user', isAdmin=0 WHERE role NOT IN ('admin','super-admin') AND (isAdmin=0 OR isAdmin IS NULL)`);
}

async function ensureSchema() {
  await ensureRoleColumn();
  await alignRolesWithFlags();
  await ensureChatTables();
}

module.exports = { ensureSchema };
