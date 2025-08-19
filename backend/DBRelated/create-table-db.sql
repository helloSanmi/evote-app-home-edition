CREATE DATABASE votingapp;

-- Create the user 'dbadmin' and grant privileges on the DB server
CREATE USER 'dbadmin'@'192.168.10.51' IDENTIFIED BY 'Password@Newm3';
GRANT ALL PRIVILEGES ON votingapp.* TO 'dbadmin'@'localhost';
FLUSH PRIVILEGES;

USE votingapp;

INSERT INTO Users (fullName, username, email, password, hasVoted)
VALUES (
    'Admin Vote',
    'voteadm',
    'voteadm@techanalytics.org',
    '$2a$10$XSKk37J0lsxMyuGckb1S0OvfZkH63csXfQTyQoZDY7pllPpyJvjRe',
    FALSE
);


-- Lines to delete all entries

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE Votes;
TRUNCATE TABLE Candidates;
TRUNCATE TABLE VotingPeriod;
TRUNCATE TABLE Users;

SET FOREIGN_KEY_CHECKS = 1;

DELETE FROM Users;

-- EOD


SELECT * FROM Users;


-- Create the 'Users' table
CREATE TABLE Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fullName VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    hasVoted BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (hasVoted IN (0, 1)),
    INDEX idx_username (username),
    INDEX idx_email (email)
) ENGINE=InnoDB;

-- Create the 'VotingPeriod' table
CREATE TABLE VotingPeriod (
    id INT AUTO_INCREMENT PRIMARY KEY,
    startTime DATETIME NOT NULL,
    endTime DATETIME NOT NULL,
    resultsPublished BOOLEAN DEFAULT FALSE,
    forcedEnded BOOLEAN DEFAULT FALSE,
    CHECK (resultsPublished IN (0, 1)),
    CHECK (forcedEnded IN (0, 1)),
    INDEX idx_start_end (startTime, endTime)
) ENGINE=InnoDB;

-- Create the 'Candidates' table
CREATE TABLE Candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    lga VARCHAR(255),
    photoUrl VARCHAR(255),
    periodId INT NULL,
    published BOOLEAN DEFAULT FALSE,
    votes INT DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (published IN (0, 1)),
    FOREIGN KEY (periodId) REFERENCES VotingPeriod(id) ON DELETE SET NULL,
    INDEX idx_periodId (periodId),
    INDEX idx_published (published)
) ENGINE=InnoDB;

-- Create the 'Votes' table
CREATE TABLE Votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    candidateId INT NOT NULL,
    periodId INT NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (userId, periodId),
    FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (candidateId) REFERENCES Candidates(id) ON DELETE CASCADE,
    FOREIGN KEY (periodId) REFERENCES VotingPeriod(id) ON DELETE CASCADE,
    INDEX idx_period_candidate (periodId, candidateId),
    INDEX idx_userId (userId)
) ENGINE=InnoDB;



-- === Users: add eligibility-related fields (all nullable / backward-compatible)
ALTER TABLE Users
  ADD COLUMN dateOfBirth DATE NULL,
  ADD COLUMN residenceLGA VARCHAR(255) NULL,
  ADD COLUMN nationalId VARCHAR(255) NULL UNIQUE,
  ADD COLUMN phone VARCHAR(50) NULL,
  ADD COLUMN eligibilityStatus ENUM('pending','eligible','ineligible') NOT NULL DEFAULT 'pending';

-- === VotingPeriod: add eligibility rules + keep your titles in-period (no separate meta table needed)
ALTER TABLE VotingPeriod
  ADD COLUMN title VARCHAR(255) NULL,
  ADD COLUMN description TEXT NULL,
  ADD COLUMN minAge INT NULL,
  ADD COLUMN scopeLGA VARCHAR(255) NULL,
  ADD COLUMN requireWhitelist TINYINT(1) NOT NULL DEFAULT 0;

-- === Optional: whitelist table used only when requireWhitelist = 1
CREATE TABLE IF NOT EXISTS EligibleVoters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NULL,
  voterId VARCHAR(255) UNIQUE NULL,
  lga VARCHAR(255) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


SELECT * FROM EligibleVoters;


-- Disable foreign key checks to allow truncation safely
SET FOREIGN_KEY_CHECKS = 0;

-- Clear votes first (depends on Users & Candidates)
TRUNCATE TABLE Votes;

-- Clear candidates (depends on VotingPeriod)
TRUNCATE TABLE Candidates;

-- Clear sessions
TRUNCATE TABLE VotingPeriod;

-- Clear users
TRUNCATE TABLE Users;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;