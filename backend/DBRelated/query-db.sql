-- backend/query-db.sql

-- This script is used to reset the database by truncating all tables
-- and then selecting all users to verify the reset.

-- Disable foreign key constraints (SQL Server syntax)
ALTER TABLE Votes NOCHECK CONSTRAINT ALL;
ALTER TABLE Candidates NOCHECK CONSTRAINT ALL;
ALTER TABLE VotingPeriod NOCHECK CONSTRAINT ALL;
ALTER TABLE Users NOCHECK CONSTRAINT ALL;

TRUNCATE TABLE Votes;
TRUNCATE TABLE Candidates;
TRUNCATE TABLE VotingPeriod;
TRUNCATE TABLE Users;

-- Re-enable foreign key constraints (SQL Server syntax)
ALTER TABLE Votes CHECK CONSTRAINT ALL;
ALTER TABLE Candidates CHECK CONSTRAINT ALL;
ALTER TABLE VotingPeriod CHECK CONSTRAINT ALL;
ALTER TABLE Users CHECK CONSTRAINT ALL;


-- Select all users 
SELECT * FROM Users;