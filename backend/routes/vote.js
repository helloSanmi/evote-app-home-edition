const express = require("express");
const router = express.Router();
const { q } = require("../db");
const { requireAuth } = require("../middleware/auth");

function yearsBetween(dobStr) {
  if (!dobStr) return 0;
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// Your vote status in a period
router.get("/status", requireAuth, async (req, res) => {
  try {
    const pid = Number(req.query.periodId || 0);
    if (!pid) return res.status(400).json({ error: "MISSING_ID" });
    const [[v]] = await q(
      `SELECT TOP 1 v.id, v.candidateId, c.name
       FROM Votes v JOIN Candidates c ON c.id=v.candidateId
       WHERE v.periodId=? AND v.userId=?`, [pid, req.user.id]
    );
    res.json({ hasVoted: !!v, youVoted: v ? { id: v.candidateId, name: v.name } : null });
  } catch (e) {
    console.error("vote/status:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// Cast a vote
router.post("/", requireAuth, async (req, res) => {
  try {
    const cid = Number(req.body?.candidateId || 0);
    if (!cid) return res.status(400).json({ error: "MISSING_FIELD", message: "candidateId required" });

    const [[cand]] = await q(`SELECT TOP 1 id, periodId FROM Candidates WHERE id=?`, [cid]);
    if (!cand?.periodId) return res.status(400).json({ error: "INVALID", message: "Candidate not in a session" });

    const [[p]] = await q(`SELECT TOP 1 id, minAge FROM VotingPeriod WHERE id=?`, [cand.periodId]);
    if (!p) return res.status(404).json({ error: "NOT_FOUND" });

    const [[me]] = await q(`SELECT TOP 1 dateOfBirth FROM Users WHERE id=?`, [req.user.id]);
    const myAge = yearsBetween(me?.dateOfBirth);
    const minAge = Math.max(Number(p.minAge || 0), 18);
    if (myAge < minAge) return res.status(403).json({ error: "FORBIDDEN", message: "You must be at least 18 to vote" });

    const [[dupe]] = await q(`SELECT TOP 1 id FROM Votes WHERE userId=? AND periodId=?`, [req.user.id, p.id]);
    if (dupe) return res.status(409).json({ error: "DUPLICATE", message: "You already voted" });

    await q(`INSERT INTO Votes (userId, candidateId, periodId) VALUES (?,?,?)`, [req.user.id, cid, p.id]);
    await q(`UPDATE Candidates SET votes=votes+1 WHERE id=?`, [cid]);

    req.app.get("io")?.emit("voteUpdate", { periodId: p.id });
    res.json({ success: true });
  } catch (e) {
    console.error("vote/post:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// For Results page: all sessions the user participated in
router.get("/my-participations", requireAuth, async (req, res) => {
  try {
    const [rows] = await q(
      `SELECT DISTINCT vp.id, vp.title, vp.description, vp.startTime, vp.endTime,
              vp.resultsPublished, vp.forcedEnded, COALESCE(vp.scope,'national') AS scope, vp.scopeState
       FROM Votes v INNER JOIN VotingPeriod vp ON vp.id = v.periodId
       WHERE v.userId=? ORDER BY vp.endTime DESC, vp.id DESC`,
       [req.user.id]
    );
    res.json(rows || []);
  } catch (e) {
    console.error("vote/my-participations:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

module.exports = router;
