-- backend/DBRelated/schema.sql
-- MySQL schema for the voting app. Statements are idempotent where possible.

CREATE TABLE IF NOT EXISTS Users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fullName VARCHAR(120) NOT NULL,
  firstName VARCHAR(60) NULL,
  lastName VARCHAR(60) NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  email VARCHAR(200) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  state VARCHAR(100) NULL,
  residenceLGA VARCHAR(100) NULL,
  phone VARCHAR(40) NULL,
  nationality VARCHAR(80) NULL,
  dateOfBirth DATE NULL,
  gender VARCHAR(20) NULL,
  nationalId VARCHAR(30) NULL,
  voterCardNumber VARCHAR(30) NULL,
  residenceAddress VARCHAR(255) NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'user',
  eligibilityStatus VARCHAR(20) NOT NULL DEFAULT 'pending',
  profilePhoto VARCHAR(500) NULL,
  lastLoginAt DATETIME NULL,
  deletedAt DATETIME NULL,
  purgeAt DATETIME NULL,
  restoreToken VARCHAR(128) NULL,
  hasVoted TINYINT(1) NOT NULL DEFAULT 0,
  mustResetPassword TINYINT(1) NOT NULL DEFAULT 0,
  isAdmin TINYINT(1) NOT NULL DEFAULT 0,
  chatStatus VARCHAR(10) NOT NULL DEFAULT 'offline',
  googleId VARCHAR(64) NULL UNIQUE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_nationalId (nationalId),
  UNIQUE KEY uq_users_voterCard (voterCardNumber),
  KEY idx_users_role (role),
  KEY idx_users_deleted (deletedAt),
  KEY idx_users_purge (purgeAt),
  KEY idx_users_last_login (lastLoginAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS VotingPeriod (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NULL,
  description TEXT NULL,
  startTime DATETIME NOT NULL,
  endTime DATETIME NOT NULL,
  minAge TINYINT UNSIGNED NOT NULL DEFAULT 18,
  scope VARCHAR(20) NOT NULL DEFAULT 'national',
  scopeState VARCHAR(100) NULL,
  scopeLGA VARCHAR(100) NULL,
  resultsPublished TINYINT(1) NOT NULL DEFAULT 0,
  forcedEnded TINYINT(1) NOT NULL DEFAULT 0,
  requireWhitelist TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_votingperiod_endTime (endTime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Candidates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  state VARCHAR(100) NULL,
  lga VARCHAR(100) NULL,
  photoUrl VARCHAR(500) NULL,
  periodId INT NULL,
  published TINYINT(1) NOT NULL DEFAULT 0,
  votes INT NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_candidates_period FOREIGN KEY (periodId) REFERENCES VotingPeriod(id) ON DELETE SET NULL,
  KEY idx_candidates_period (periodId),
  KEY idx_candidates_published (published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Votes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  candidateId INT NOT NULL,
  periodId INT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_votes_user_period (userId, periodId),
  CONSTRAINT fk_votes_user FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_candidate FOREIGN KEY (candidateId) REFERENCES Candidates(id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_period FOREIGN KEY (periodId) REFERENCES VotingPeriod(id) ON DELETE CASCADE,
  KEY idx_votes_candidate (candidateId),
  KEY idx_votes_period (periodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS EligibleVoters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periodId INT NOT NULL,
  email VARCHAR(255) NULL,
  voterId VARCHAR(255) NULL,
  lga VARCHAR(100) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eligible_period FOREIGN KEY (periodId) REFERENCES VotingPeriod(id) ON DELETE CASCADE,
  UNIQUE KEY ux_eligible_period_email (periodId, email),
  UNIQUE KEY ux_eligible_period_voter (periodId, voterId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS RequestLogs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(255) NOT NULL,
  userId INT NULL,
  ip VARCHAR(64) NOT NULL,
  statusCode INT NULL,
  durationMs INT NULL,
  queryParams TEXT NULL,
  bodyParams TEXT NULL,
  country VARCHAR(2) NULL,
  city VARCHAR(100) NULL,
  userAgent VARCHAR(255) NULL,
  referer VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_requestlogs_user FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE SET NULL,
  KEY idx_requestlogs_created (createdAt),
  KEY idx_requestlogs_user (userId),
  KEY idx_requestlogs_status (statusCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ChatGuestToken (
  sessionId INT NOT NULL PRIMARY KEY,
  token VARCHAR(200) NOT NULL UNIQUE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chatguesttoken_session FOREIGN KEY (sessionId) REFERENCES ChatSession(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
