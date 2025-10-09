-- backend/DBRelated/schema.sql
-- Azure SQL (SQL Server) schema for the voting app. Designed to be idempotent.

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        fullName NVARCHAR(120) NOT NULL,
        username NVARCHAR(60) NOT NULL UNIQUE,
        email NVARCHAR(200) NOT NULL UNIQUE,
        password NVARCHAR(255) NOT NULL,
        state NVARCHAR(100) NULL,
        residenceLGA NVARCHAR(100) NULL,
        phone NVARCHAR(40) NULL,
        nationality NVARCHAR(80) NULL,
        dateOfBirth DATE NULL,
        role NVARCHAR(30) NOT NULL CONSTRAINT DF_Users_role DEFAULT N'user',
        eligibilityStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_Eligibility DEFAULT N'pending',
        profilePhoto NVARCHAR(500) NULL,
        hasVoted BIT NOT NULL CONSTRAINT DF_Users_hasVoted DEFAULT 0,
        isAdmin BIT NOT NULL CONSTRAINT DF_Users_isAdmin DEFAULT 0,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_Users_createdAt DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF COL_LENGTH('dbo.Users', 'role') IS NULL
BEGIN
    ALTER TABLE dbo.Users
        ADD role NVARCHAR(30) NOT NULL CONSTRAINT DF_Users_role DEFAULT N'user' WITH VALUES;
END;
GO

IF OBJECT_ID(N'dbo.VotingPeriod', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VotingPeriod (
        id INT IDENTITY(1,1) PRIMARY KEY,
        title NVARCHAR(200) NULL,
        description NVARCHAR(MAX) NULL,
        startTime DATETIME2 NOT NULL,
        endTime DATETIME2 NOT NULL,
        minAge TINYINT NOT NULL CONSTRAINT DF_VotingPeriod_minAge DEFAULT 18,
        scope NVARCHAR(20) NOT NULL CONSTRAINT DF_VotingPeriod_scope DEFAULT N'national',
        scopeState NVARCHAR(100) NULL,
        scopeLGA NVARCHAR(100) NULL,
        resultsPublished BIT NOT NULL CONSTRAINT DF_VotingPeriod_resultsPublished DEFAULT 0,
        forcedEnded BIT NOT NULL CONSTRAINT DF_VotingPeriod_forcedEnded DEFAULT 0,
        requireWhitelist BIT NOT NULL CONSTRAINT DF_VotingPeriod_requireWhitelist DEFAULT 0,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_VotingPeriod_createdAt DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_VotingPeriod_Time' AND object_id = OBJECT_ID(N'dbo.VotingPeriod')
)
BEGIN
    CREATE INDEX IX_VotingPeriod_Time ON dbo.VotingPeriod(endTime);
END;
GO

IF OBJECT_ID(N'dbo.Candidates', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Candidates (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(120) NOT NULL,
        state NVARCHAR(100) NULL,
        lga NVARCHAR(100) NULL,
        photoUrl NVARCHAR(500) NULL,
        periodId INT NULL,
        published BIT NOT NULL CONSTRAINT DF_Candidates_published DEFAULT 0,
        votes INT NOT NULL CONSTRAINT DF_Candidates_votes DEFAULT 0,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_Candidates_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Candidates_Period FOREIGN KEY (periodId) REFERENCES dbo.VotingPeriod(id) ON DELETE SET NULL
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_Candidates_Period' AND object_id = OBJECT_ID(N'dbo.Candidates')
)
BEGIN
    CREATE INDEX IX_Candidates_Period ON dbo.Candidates(periodId);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_Candidates_Published' AND object_id = OBJECT_ID(N'dbo.Candidates')
)
BEGIN
    CREATE INDEX IX_Candidates_Published ON dbo.Candidates(published);
END;
GO

IF OBJECT_ID(N'dbo.Votes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Votes (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        userId INT NOT NULL,
        candidateId INT NOT NULL,
        periodId INT NOT NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_Votes_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Votes_User FOREIGN KEY (userId) REFERENCES dbo.Users(id) ON DELETE CASCADE,
        CONSTRAINT FK_Votes_Candidate FOREIGN KEY (candidateId) REFERENCES dbo.Candidates(id) ON DELETE CASCADE,
        CONSTRAINT FK_Votes_Period FOREIGN KEY (periodId) REFERENCES dbo.VotingPeriod(id) ON DELETE CASCADE,
        CONSTRAINT UQ_Votes_User_Period UNIQUE (userId, periodId)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_Votes_Candidate' AND object_id = OBJECT_ID(N'dbo.Votes')
)
BEGIN
    CREATE INDEX IX_Votes_Candidate ON dbo.Votes(candidateId);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_Votes_Period' AND object_id = OBJECT_ID(N'dbo.Votes')
)
BEGIN
    CREATE INDEX IX_Votes_Period ON dbo.Votes(periodId);
END;
GO

IF OBJECT_ID(N'dbo.EligibleVoters', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EligibleVoters (
        id INT IDENTITY(1,1) PRIMARY KEY,
        periodId INT NOT NULL,
        email NVARCHAR(255) NULL,
        voterId NVARCHAR(255) NULL,
        lga NVARCHAR(100) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_EligibleVoters_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_EligibleVoters_Period FOREIGN KEY (periodId) REFERENCES dbo.VotingPeriod(id) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'UX_EligibleVoters_PeriodEmail' AND object_id = OBJECT_ID(N'dbo.EligibleVoters')
)
BEGIN
    CREATE UNIQUE INDEX UX_EligibleVoters_PeriodEmail
        ON dbo.EligibleVoters(periodId, email)
        WHERE email IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'UX_EligibleVoters_PeriodVoter' AND object_id = OBJECT_ID(N'dbo.EligibleVoters')
)
BEGIN
    CREATE UNIQUE INDEX UX_EligibleVoters_PeriodVoter
        ON dbo.EligibleVoters(periodId, voterId)
        WHERE voterId IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.RequestLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RequestLogs (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        method NVARCHAR(10) NOT NULL,
        path NVARCHAR(255) NOT NULL,
        userId INT NULL,
        ip NVARCHAR(64) NOT NULL,
        country NVARCHAR(2) NULL,
        city NVARCHAR(100) NULL,
        userAgent NVARCHAR(255) NULL,
        referer NVARCHAR(255) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_RequestLogs_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_RequestLogs_User FOREIGN KEY (userId) REFERENCES dbo.Users(id) ON DELETE SET NULL
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_RequestLogs_Created' AND object_id = OBJECT_ID(N'dbo.RequestLogs')
)
BEGIN
    CREATE INDEX IX_RequestLogs_Created ON dbo.RequestLogs(createdAt DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_RequestLogs_User' AND object_id = OBJECT_ID(N'dbo.RequestLogs')
)
BEGIN
    CREATE INDEX IX_RequestLogs_User ON dbo.RequestLogs(userId);
END;
GO
