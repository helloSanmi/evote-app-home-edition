-- backend/query-db.sql

-- This script is used to reset the database by truncating all tables
-- and then selecting all users to verify the reset.

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE Votes;
TRUNCATE TABLE Candidates;
TRUNCATE TABLE VotingPeriod;
TRUNCATE TABLE Users;

SET FOREIGN_KEY_CHECKS = 1;


-- Select all users 
SELECT * FROM Users;