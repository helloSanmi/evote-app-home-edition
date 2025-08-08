// backend/routes/vote.js
const express = require("express");
const { getDbPool, sql } = require("../db");
const router = express.Router();

router.post("/", async (req, res) => {
  const { userId, candidateId } = req.body;

  try {
    const pool = await getDbPool();

    // Get current Voting Period
    const periodResult = await pool.request().query("SELECT TOP 1 * FROM VotingPeriod ORDER BY id DESC");
    if (periodResult.recordset.length === 0) {
      return res.status(400).json({ error: "No voting period set" });
    }
    const periodId = periodResult.recordset[0].id;

    // Check if user has already voted in this period
    const existingVote = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("periodId", sql.Int, periodId)
      .query("SELECT * FROM Votes WHERE userId = @userId AND periodId = @periodId");

    if (existingVote.recordset.length > 0) {
      return res.status(400).json({ error: "User has already voted" });
    }

    // Cast the vote inside a transaction
    const transaction = pool.transaction();
    await transaction.begin();

    await transaction
      .request()
      .input("userId", sql.Int, userId)
      .input("candidateId", sql.Int, candidateId)
      .input("periodId", sql.Int, periodId)
      .query("INSERT INTO Votes (userId, candidateId, periodId) VALUES (@userId, @candidateId, @periodId)");

    await transaction
      .request()
      .input("candidateId", sql.Int, candidateId)
      .input("periodId", sql.Int, periodId)
      .query("UPDATE Candidates SET votes = votes + 1 WHERE id = @candidateId AND periodId = @periodId");

    await transaction.commit();

    // Emit a 'voteCast' event for live updates
    req.app.get("emitUpdate")("voteCast");

    res.status(201).json({ message: "Vote cast successfully" });
  } catch (error) {
    console.error("Error casting vote:", error.message);
    res.status(500).json({ error: "Error casting vote" });
  }
});

module.exports = router;
