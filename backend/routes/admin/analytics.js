const { q } = require("../../db");
const { requireAuth, requireAdmin } = require("../../middleware/auth");
const { buildMetricsSnapshot } = require("../../utils/telemetry");
const { resolveAdminScope, toKey } = require("./utils");

module.exports = function registerAnalyticsRoutes(router) {
  router.get("/analytics/summary", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const stateKey = toKey(scopeInfo.state);

      const userFilters = [];
      const userParams = [];
      if (!scopeInfo.isSuper) {
        userFilters.push(`LOWER(COALESCE(state,'')) = ?`);
        userParams.push(stateKey);
      }
      const userWhere = userFilters.length ? `WHERE ${userFilters.join(" AND ")}` : "";
      const [[userTotals]] = await q(
        `
        SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN role='user' THEN 1 ELSE 0 END) AS totalVoters,
          SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) AS totalAdmins,
          SUM(CASE WHEN role='super-admin' THEN 1 ELSE 0 END) AS totalSuperAdmins
        FROM Users
        ${userWhere}
      `,
        userParams
      );

      const periodFilters = [];
      const periodParams = [];
      if (!scopeInfo.isSuper) {
        periodFilters.push(`LOWER(COALESCE(vp.scope,'')) <> 'national'`);
        periodFilters.push(`LOWER(COALESCE(vp.scopeState,'')) = ?`);
        periodParams.push(stateKey);
      }
      const periodWhere = periodFilters.length ? `WHERE ${periodFilters.join(" AND ")}` : "";

      const [[voteTotals]] = await q(
        `
        SELECT COUNT(*) AS totalVotes
          FROM Votes v
          JOIN VotingPeriod vp ON vp.id = v.periodId
        ${periodWhere}
      `,
        periodParams
      );

      const activeConditions = [
        `forcedEnded=0`,
        `resultsPublished=0`,
        `startTime <= UTC_TIMESTAMP()`,
        `endTime >= UTC_TIMESTAMP()`,
      ];
      const activeParams = [];
      if (!scopeInfo.isSuper) {
        activeConditions.push(`LOWER(COALESCE(scope,'')) <> 'national'`);
        activeConditions.push(`LOWER(COALESCE(scopeState,'')) = ?`);
        activeParams.push(stateKey);
      }
      const [[activeSessions]] = await q(
        `
        SELECT COUNT(*) AS activeSessions
          FROM VotingPeriod
         WHERE ${activeConditions.join(" AND ")}
      `,
        activeParams
      );

      const publishedConditions = [`resultsPublished=1`];
      const publishedParams = [];
      if (!scopeInfo.isSuper) {
        publishedConditions.push(`LOWER(COALESCE(scope,'')) <> 'national'`);
        publishedConditions.push(`LOWER(COALESCE(scopeState,'')) = ?`);
        publishedParams.push(stateKey);
      }
      const [[publishedSessions]] = await q(
        `
        SELECT COUNT(*) AS publishedSessions
          FROM VotingPeriod
         WHERE ${publishedConditions.join(" AND ")}
      `,
        publishedParams
      );

      let scopeSql = `
        SELECT COALESCE(vp.scope,'national') AS scope,
               COUNT(*) AS sessions,
               SUM(COALESCE(vt.voteCount,0)) AS votes
          FROM VotingPeriod vp
          LEFT JOIN (
            SELECT periodId, COUNT(*) AS voteCount
              FROM Votes
             GROUP BY periodId
          ) vt ON vt.periodId = vp.id
      `;
      const scopeParams = [];
      if (!scopeInfo.isSuper) {
        scopeSql += ` WHERE LOWER(COALESCE(vp.scope,'')) <> 'national' AND LOWER(COALESCE(vp.scopeState,'')) = ?`;
        scopeParams.push(stateKey);
      }
      scopeSql += ` GROUP BY scope`;
      const [scopeRows] = await q(scopeSql, scopeParams);

      const stateCountParams = [];
      let stateCountSql = `
        SELECT
          LOWER(COALESCE(state,'')) AS stateKey,
          COALESCE(NULLIF(TRIM(state),''),'Unknown') AS stateLabel,
          COUNT(*) AS total
        FROM Users
        WHERE role='user'
      `;
      if (!scopeInfo.isSuper) {
        stateCountSql += ` AND LOWER(COALESCE(state,'')) = ?`;
        stateCountParams.push(stateKey);
      }
      stateCountSql += ` GROUP BY stateKey, stateLabel`;
      const [stateCountsRows] = await q(stateCountSql, stateCountParams);

      const lgaCountParams = [];
      let lgaCountSql = `
        SELECT
          LOWER(COALESCE(state,'')) AS stateKey,
          LOWER(COALESCE(residenceLGA,'')) AS lgaKey,
          COUNT(*) AS total
        FROM Users
        WHERE role='user'
      `;
      if (!scopeInfo.isSuper) {
        lgaCountSql += ` AND LOWER(COALESCE(state,'')) = ?`;
        lgaCountParams.push(stateKey);
      }
      lgaCountSql += ` GROUP BY stateKey, lgaKey`;
      const [lgaCountsRows] = await q(lgaCountSql, lgaCountParams);

      let recentSql = `
        SELECT vp.id,
               vp.title,
               vp.scope,
               vp.scopeState,
               vp.scopeLGA,
               vp.startTime,
               vp.endTime,
               vp.resultsPublished,
               vp.forcedEnded,
               COALESCE(vt.voteCount,0) AS votes
          FROM VotingPeriod vp
          LEFT JOIN (
            SELECT periodId, COUNT(*) AS voteCount
              FROM Votes
             GROUP BY periodId
          ) vt ON vt.periodId = vp.id
      `;
      const recentParams = [];
      if (!scopeInfo.isSuper) {
        recentSql += ` WHERE LOWER(COALESCE(vp.scope,'')) <> 'national' AND LOWER(COALESCE(vp.scopeState,'')) = ?`;
        recentParams.push(stateKey);
      }
      recentSql += ` ORDER BY vp.endTime DESC, vp.id DESC LIMIT 10`;
      const [recentSessionsRows] = await q(recentSql, recentParams);

      const totalVoters = Number(userTotals?.totalVoters || 0);

      const stateCountMap = {};
      stateCountsRows.forEach((row) => {
        const key = (row.stateKey || "").trim();
        if (!key) return;
        stateCountMap[key] = Number(row.total || 0);
      });

      const lgaCountMap = {};
      lgaCountsRows.forEach((row) => {
        const stateKeyRow = (row.stateKey || "").trim();
        const lgaKey = (row.lgaKey || "").trim();
        if (!stateKeyRow || !lgaKey) return;
        lgaCountMap[`${stateKeyRow}|${lgaKey}`] = Number(row.total || 0);
      });

      const recentSessions = recentSessionsRows.map((row) => {
        const scope = (row.scope || "national").toLowerCase();
        const periodStateKey = (row.scopeState || "").trim().toLowerCase();
        const periodLgaKey = (row.scopeLGA || "").trim().toLowerCase();
        let eligible = totalVoters;
        if (scope === "state") {
          eligible = stateCountMap[periodStateKey] || 0;
        } else if (scope === "local") {
          eligible = lgaCountMap[`${periodStateKey}|${periodLgaKey}`] || 0;
        }
        const votes = Number(row.votes || 0);
        const turnout = eligible > 0 ? Math.min(100, (votes / eligible) * 100) : null;
        return {
          id: row.id,
          title: row.title,
          scope,
          scopeState: row.scopeState,
          scopeLGA: row.scopeLGA,
          startTime: row.startTime,
          endTime: row.endTime,
          resultsPublished: !!row.resultsPublished,
          forcedEnded: !!row.forcedEnded,
          votes,
          eligible,
          turnout: turnout === null ? null : Number(turnout.toFixed(2)),
        };
      });

      const topStates = [...stateCountsRows]
        .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
        .slice(0, 8)
        .map((row) => ({
          state: row.stateLabel,
          voters: Number(row.total || 0),
          share: totalVoters > 0 ? Number(((row.total || 0) / totalVoters * 100).toFixed(2)) : 0,
        }));

      const scopeBreakdown = scopeRows.map((row) => ({
        scope: (row.scope || "national").toLowerCase(),
        sessions: Number(row.sessions || 0),
        votes: Number(row.votes || 0),
      }));

      res.json({
        totals: {
          users: Number(userTotals?.totalUsers || 0),
          voters: totalVoters,
          admins: Number(userTotals?.totalAdmins || 0),
          superAdmins: Number(userTotals?.totalSuperAdmins || 0),
          votesCast: Number(voteTotals?.totalVotes || 0),
          activeSessions: Number(activeSessions?.activeSessions || 0),
          publishedSessions: Number(publishedSessions?.publishedSessions || 0),
        },
        scopeBreakdown,
        topStates,
        recentSessions,
      });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/analytics:", err);
      res.status(500).json({ error: "SERVER", message: "Could not load analytics" });
    }
  });

  router.get("/metrics/summary", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const snapshot = await buildMetricsSnapshot();
      res.json(snapshot);
    } catch (err) {
      console.error("admin/metrics/summary:", err);
      res.status(500).json({ error: "SERVER" });
    }
  });
};
