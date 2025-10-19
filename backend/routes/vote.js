const express = require("express");
const router = express.Router();
const { q } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { checkEligibility } = require("../utils/eligibility");

const normalize = (value) => (value || "").trim().toLowerCase();

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
      `SELECT v.id, v.candidateId, c.name
       FROM Votes v JOIN Candidates c ON c.id=v.candidateId
       WHERE v.periodId=? AND v.userId=?
       LIMIT 1`, [pid, req.user.id]
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

    const [[candidate]] = await q(`SELECT id, periodId, state, lga FROM Candidates WHERE id=? LIMIT 1`, [cid]);
    if (!candidate?.periodId) return res.status(400).json({ error: "INVALID", message: "Candidate not in a session" });

    const [[period]] = await q(`SELECT id, minAge, scope, scopeState, scopeLGA, startTime, requireWhitelist FROM VotingPeriod WHERE id=? LIMIT 1`, [candidate.periodId]);
    if (!period) return res.status(404).json({ error: "NOT_FOUND" });

    const [[user]] = await q(`SELECT email, state, residenceLGA, dateOfBirth FROM Users WHERE id=? LIMIT 1`, [req.user.id]);

    const periodScope = (period.scope || 'national').toLowerCase();
    if (periodScope === 'state') {
      if (!normalize(candidate.state) || normalize(candidate.state) !== normalize(period.scopeState)) {
        return res.status(400).json({ error: "SCOPE_MISMATCH", message: "Candidate does not belong to this state election" });
      }
    }
    if (periodScope === 'local') {
      if (!normalize(candidate.state) || normalize(candidate.state) !== normalize(period.scopeState) || !normalize(candidate.lga) || normalize(candidate.lga) !== normalize(period.scopeLGA)) {
        return res.status(400).json({ error: "SCOPE_MISMATCH", message: "Candidate does not belong to this local government election" });
      }
    }

    const myAge = yearsBetween(user?.dateOfBirth);
    const minAge = Math.max(Number(period.minAge || 0), 18);
    if (myAge < minAge) return res.status(403).json({ error: "FORBIDDEN", message: "You must be at least 18 to vote" });

    const [[dupe]] = await q(`SELECT id FROM Votes WHERE userId=? AND periodId=? LIMIT 1`, [req.user.id, period.id]);
    if (dupe) return res.status(409).json({ error: "DUPLICATE", message: "You already voted" });

    const poolAdapter = { query: (sqlText, params = []) => q(sqlText, params) };
    const eligibility = await checkEligibility(poolAdapter, {
      email: user?.email || null,
      state: user?.state || null,
      residenceLGA: user?.residenceLGA || null,
      dateOfBirth: user?.dateOfBirth || null,
    }, {
      minAge: period.minAge,
      startTime: period.startTime,
      scope: period.scope,
      scopeState: period.scopeState,
      scopeLGA: period.scopeLGA,
      requireWhitelist: period.requireWhitelist,
    });

    if (!eligibility.eligible) {
      return res.status(403).json({ error: "FORBIDDEN", message: eligibility.reason || "You are not eligible for this session" });
    }

    await q(`INSERT INTO Votes (userId, candidateId, periodId) VALUES (?,?,?)`, [req.user.id, cid, period.id]);
    await q(`UPDATE Candidates SET votes=votes+1 WHERE id=?`, [cid]);

    req.app.get("io")?.emit("voteUpdate", { periodId: period.id });
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
