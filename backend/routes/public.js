const express = require("express");
const router = express.Router();
const { q } = require("../db");
const { requireAuth } = require("../middleware/auth");

const nowSQL = () => new Date().toISOString().slice(0, 19).replace("T"," ");

function yearsBetween(dobStr) {
  if (!dobStr) return 0;
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

async function getUserCore(userId) {
  const [[u]] = await q(`SELECT id, state, residenceLGA, dateOfBirth FROM Users WHERE id=?`, [userId]);
  return u || null;
}

function scopeAllows(user, period) {
  if (!period) return false;
  const scope = (period.scope || 'national').toLowerCase();
  if (scope === 'national') return true;
  const userState = (user?.state || '').toLowerCase();
  const userLga = (user?.residenceLGA || '').toLowerCase();
  const targetState = (period.scopeState || '').toLowerCase();
  const targetLga = (period.scopeLGA || '').toLowerCase();
  if (scope === 'state') {
    return Boolean(userState && targetState && userState === targetState);
  }
  if (scope === 'local') {
    return Boolean(userState && targetState && userState === targetState && userLga && targetLga && userLga === targetLga);
  }
  return false;
}

// Sessions the user is eligible to SEE (not published)
router.get("/eligible-sessions", requireAuth, async (req, res) => {
  try {
    const me = await getUserCore(req.user.id);
    const myAge = yearsBetween(me?.dateOfBirth);
    const [rows] = await q(
      `SELECT * FROM VotingPeriod
       WHERE resultsPublished=0 AND endTime >= ?
       ORDER BY startTime ASC`,
      [nowSQL()]
    );

    const eligible = rows.filter(p => {
      const minAge = Math.max(Number(p.minAge || 0), 18);
      if (myAge < minAge) return false;
      return scopeAllows(me, p);
    });

    res.json(eligible);
  } catch (e) {
    console.error("public/eligible-sessions:", e);
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

// Candidates for a session (public view)
router.get("/candidates", requireAuth, async (req, res) => {
  try {
    const pid = Number(req.query.periodId || 0);
    if (!pid) return res.status(400).json({ error: "MISSING_ID" });
    const [rows] = await q(
      `SELECT id, name, state, lga, photoUrl, votes FROM Candidates WHERE periodId=? ORDER BY votes DESC, id ASC`,
      [pid]
    );
    res.json(rows);
  } catch (e) {
    console.error("public/candidates:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// Published sessions (for Results page dropdown)
router.get("/published-sessions", requireAuth, async (req, res) => {
  try {
    const me = await getUserCore(req.user.id);
    const [rows] = await q(
      `SELECT * FROM VotingPeriod WHERE resultsPublished=1 ORDER BY endTime DESC`
    );
    const allowed = rows.filter((p) => scopeAllows(me, p));
    res.json(allowed);
  } catch (e) {
    console.error("public/published-sessions:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// Results for a session
router.get("/results", requireAuth, async (req, res) => {
  try {
    const pid = Number(req.query.periodId || 0);
    if (!pid) return res.status(400).json({ error: "MISSING_ID" });
    const [[period]] = await q(`SELECT * FROM VotingPeriod WHERE id=?`, [pid]);
    if (!period?.resultsPublished) return res.status(403).json({ error: "FORBIDDEN", message: "Not published" });

    const me = await getUserCore(req.user.id);
    if (!scopeAllows(me, period)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Results restricted to eligible voters" });
    }

    const [rows] = await q(
      `SELECT id, name, state, lga, photoUrl, votes FROM Candidates WHERE periodId=? ORDER BY votes DESC, id ASC`,
      [pid]
    );
    res.json(rows);
  } catch (e) {
    console.error("public/results:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

module.exports = router;
