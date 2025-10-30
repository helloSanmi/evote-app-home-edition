const { q } = require("../../db");
const { requireAuth, requireAdmin, requireRole } = require("../../middleware/auth");
const { recordAuditEvent } = require("../../utils/audit");
const { notify } = require("../../utils/notifications");
const emailService = require("../../services/emailService");
const {
  resolveAdminScope,
  periodMatchesScope,
  candidateMatchesScope,
  notifyAdminAction,
  toKey,
  actorLabel,
} = require("./utils");

module.exports = function registerSessionRoutes(router) {
  router.post("/voting-period", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const {
        title,
        description,
        start,
        end,
        minAge,
        scope,
        scopeState,
        scopeLGA,
      } = req.body || {};

      if (!title || !start || !end) {
        return res.status(400).json({ error: "MISSING_FIELDS", message: "Title, start, and end time are required." });
      }

      const startDate = new Date(start);
      const endDate = new Date(end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "INVALID_DATE", message: "Provide valid start and end times." });
      }
      if (endDate.getTime() <= startDate.getTime()) {
        return res.status(400).json({ error: "INVALID_RANGE", message: "End time must be after the start time." });
      }

      let electionScope = (scope || "national").toLowerCase();
      const requestedScope = electionScope;
      if (!["national", "state", "local"].includes(electionScope)) {
        electionScope = "national";
      }

      let effectiveScopeState = scopeState || null;
      let effectiveScopeLGA = scopeLGA || null;
      if (scopeInfo.isSuper) {
        if (electionScope === "state" && !effectiveScopeState) {
          return res.status(400).json({ error: "MISSING_SCOPE", message: "State elections require a state." });
        }
        if (electionScope === "local" && (!effectiveScopeState || !effectiveScopeLGA)) {
          return res.status(400).json({ error: "MISSING_SCOPE", message: "Local elections require both a state and an LGA." });
        }
      } else {
        if (requestedScope === "national") {
          return res.status(403).json({ error: "FORBIDDEN", message: "Only super admins can schedule national elections." });
        }
        electionScope = electionScope === "local" ? "local" : "state";
        effectiveScopeState = scopeInfo.state;
        if (!effectiveScopeState) {
          return res.status(403).json({ error: "FORBIDDEN", message: "Assign a state to this admin account before scheduling sessions." });
        }
        if (electionScope === "local" && !effectiveScopeLGA) {
          return res.status(400).json({ error: "MISSING_SCOPE", message: "Provide an LGA for local elections." });
        }
      }

      let candidateSql = `SELECT id, name, state, lga FROM Candidates WHERE published=0 AND periodId IS NULL`;
      const candidateParams = [];
      if (!scopeInfo.isSuper) {
        candidateSql += ` AND LOWER(COALESCE(state,'')) = ?`;
        candidateParams.push(toKey(scopeInfo.state));
      }
      const [draftCandidates] = await q(candidateSql, candidateParams);
      if (!draftCandidates.length) {
        return res.status(400).json({ error: "NO_CANDIDATES", message: "Add at least one unpublished candidate before starting a session." });
      }

      const normalize = (value) => (value || "").trim().toLowerCase();
      const targetState = normalize(effectiveScopeState);
      const targetLga = normalize(effectiveScopeLGA);
      const mismatched = draftCandidates.filter((cand) => {
        if (electionScope === "national") return false;
        const candState = normalize(cand.state);
        if (!candState || candState !== targetState) return true;
        if (electionScope === "local") {
          const candLga = normalize(cand.lga);
          if (!candLga || candLga !== targetLga) return true;
        }
        return false;
      });
      if (mismatched.length) {
        return res.status(400).json({
          error: "SCOPE_MISMATCH",
          message: `The following candidates do not match the selected scope: ${mismatched.map((c) => c.name).join(", ")}.`,
        });
      }

      const [insertResult] = await q(
        `INSERT INTO VotingPeriod (title, description, startTime, endTime, minAge, scope, scopeState, scopeLGA, resultsPublished, forcedEnded)
         VALUES (?,?,?,?,?,?,?,?,0,0)`,
        [
          title,
          description || null,
          startDate,
          endDate,
          Math.max(Number(minAge || 18), 18),
          electionScope,
          electionScope !== "national" ? (effectiveScopeState || null) : null,
          electionScope === "local" ? (effectiveScopeLGA || null) : null,
        ]
      );
      const insertId = insertResult?.insertId;
      if (!insertId) throw new Error("Failed to create voting period");

      const candidateIds = draftCandidates.map((cand) => cand.id);
      if (candidateIds.length) {
        const placeholders = candidateIds.map(() => "?").join(",");
        await q(
          `UPDATE Candidates SET periodId=?, published=1 WHERE id IN (${placeholders})`,
          [insertId, ...candidateIds]
        );
      }

      const io = req.app.get("io");
      io?.emit("periodCreated", { periodId: insertId });
      await notify(io, {
        audience: "user",
        type: "session.created",
        title: title ? `${title.trim()} scheduled` : "Voting session scheduled",
        message: `Voting opens on ${startDate.toLocaleString()}`,
        scope: electionScope,
        scopeState: electionScope !== "national" ? (effectiveScopeState || null) : null,
        scopeLGA: electionScope === "local" ? (effectiveScopeLGA || null) : null,
        periodId: insertId,
        metadata: {
          periodId: insertId,
          title: title || null,
          description: description || null,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          scope: electionScope,
          scopeState: electionScope !== "national" ? (effectiveScopeState || null) : null,
          scopeLGA: electionScope === "local" ? (effectiveScopeLGA || null) : null,
        },
      });
      const [[periodRow]] = await q(`SELECT * FROM VotingPeriod WHERE id=?`, [insertId]);
      if (periodRow) {
        emailService.sendSessionLifecycleEmail("scheduled", periodRow).catch((err) => {
          console.error("admin/session scheduled email", err);
        });
        await q(`UPDATE VotingPeriod SET notifyScheduledAt=UTC_TIMESTAMP() WHERE id=?`, [insertId]);
      }
      await notifyAdminAction(io, req, {
        type: "admin.session.created",
        title: "Session scheduled",
        message: `${actorLabel(req.user)} scheduled ${title ? `"${title.trim()}"` : `session #${insertId}`}.`,
        scope: "global",
        periodId: insertId,
        metadata: {
          periodId: insertId,
          scope: electionScope,
          scopeState: electionScope !== "national" ? (effectiveScopeState || null) : null,
          scopeLGA: electionScope === "local" ? (effectiveScopeLGA || null) : null,
        },
      });
      res.json({ success: true, id: insertId });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/voting-period:", err);
      res.status(500).json({ error: "SERVER" });
    }
  });

  router.get("/periods", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      let sql = `SELECT * FROM VotingPeriod`;
      const params = [];
      if (!scopeInfo.isSuper) {
        sql += ` WHERE LOWER(COALESCE(scope,'')) <> 'national' AND LOWER(COALESCE(scopeState,'')) = ?`;
        params.push(toKey(scopeInfo.state));
      }
      sql += ` ORDER BY startTime DESC, id DESC`;
      const [rows] = await q(sql, params);
      res.json(rows || []);
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/periods:", err);
      res.status(500).json({ error: "SERVER" });
    }
  });

  router.post("/periods/:id/reschedule", requireAuth, requireRole(["super-admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ error: "MISSING_ID" });
      const { startTime, endTime } = req.body || {};
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "MISSING_FIELDS", message: "Start and end times are required" });
      }
      const newStart = new Date(startTime);
      const newEnd = new Date(endTime);
      if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
        return res.status(400).json({ error: "INVALID_DATE", message: "Provide valid start and end times" });
      }
      if (newEnd.getTime() <= newStart.getTime()) {
        return res.status(400).json({ error: "INVALID_RANGE", message: "End time must be after start time" });
      }

      const [[period]] = await q(`SELECT title, startTime, endTime, scope, scopeState, scopeLGA FROM VotingPeriod WHERE id=?`, [id]);
      if (!period) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
      if (new Date(period.startTime).getTime() <= Date.now()) {
        return res.status(409).json({ error: "ALREADY_STARTED", message: "This session has already started and cannot be rescheduled" });
      }
      if (newStart.getTime() <= Date.now()) {
        return res.status(400).json({ error: "PAST_START", message: "New start time must be in the future" });
      }

      await q(`UPDATE VotingPeriod SET startTime=?, endTime=? WHERE id=?`, [newStart, newEnd, id]);
      const io = req.app.get("io");
      io?.emit("periodUpdated", { periodId: id });
      await notify(io, {
        audience: "user",
        type: "session.rescheduled",
        title: period.title ? `${period.title} rescheduled` : "Voting session rescheduled",
        message: `New start: ${newStart.toLocaleString()}`,
        scope: period.scope || "global",
        scopeState: period.scope !== "national" ? (period.scopeState || null) : null,
        scopeLGA: period.scope === "local" ? (period.scopeLGA || null) : null,
        periodId: id,
        metadata: {
          periodId: id,
          title: period.title || null,
          previousStart: new Date(period.startTime).toISOString(),
          previousEnd: new Date(period.endTime).toISOString(),
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
        },
      });
      await notifyAdminAction(io, req, {
        type: "admin.session.rescheduled",
        title: "Session rescheduled",
        message: `${actorLabel(req.user)} moved ${period.title || `session #${id}`} to ${newStart.toLocaleString()}.`,
        scope: "global",
        periodId: id,
        metadata: {
          periodId: id,
          previousStart: new Date(period.startTime).toISOString(),
          previousEnd: new Date(period.endTime).toISOString(),
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
        },
      });
      res.json({ success: true });
    } catch (err) {
      console.error("admin/periods/reschedule:", err);
      res.status(500).json({ error: "SERVER", message: "Could not reschedule session" });
    }
  });

  async function removePeriod(req, res) {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const pid = Number(req.query.periodId || req.body?.periodId || 0);
      if (!pid) return res.status(400).json({ error: "MISSING_ID" });
      const [[period]] = await q(
        `SELECT id, title, scope, scopeState FROM VotingPeriod WHERE id=?`,
        [pid]
      );
      if (!period) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
      if (!periodMatchesScope(scopeInfo, period)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You do not have access to this session." });
      }
      await q(`DELETE FROM Votes WHERE periodId=?`, [pid]);
      await q(`DELETE FROM Candidates WHERE periodId=?`, [pid]);
      await q(`DELETE FROM VotingPeriod WHERE id=?`, [pid]);
      res.json({ success: true, periodId: pid });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/periods/delete:", err);
      res.status(500).json({ error: "SERVER", message: "Could not delete voting period" });
    }
  }

  router.delete("/periods/delete", requireAuth, requireAdmin, removePeriod);
  router.post("/periods/delete", requireAuth, requireAdmin, removePeriod);

  router.post("/periods/cancel", requireAuth, requireRole(["super-admin"]), async (req, res) => {
    try {
      const pid = Number(req.body?.periodId || req.query?.periodId || 0);
      if (!pid) return res.status(400).json({ error: "MISSING_ID" });
      const [[period]] = await q(`SELECT id, title, startTime, endTime, scope, scopeState, scopeLGA FROM VotingPeriod WHERE id=?`, [pid]);
      if (!period) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
      if (new Date(period.startTime).getTime() <= Date.now()) {
        return res.status(409).json({ error: "ALREADY_STARTED", message: "This session has already started. Use end-voting instead of cancelling." });
      }
      await q(`DELETE FROM Votes WHERE periodId=?`, [pid]);
      await q(`UPDATE Candidates SET periodId=NULL, published=0 WHERE periodId=?`, [pid]);
      await q(`DELETE FROM VotingPeriod WHERE id=?`, [pid]);
      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "").toLowerCase() || null,
        action: "session.cancelled",
        entityType: "votingPeriod",
        entityId: String(pid),
        before: {
          title: period.title || null,
          startTime: period.startTime,
        },
        after: null,
        notes: "Session cancelled before start",
      });
      const io = req.app.get("io");
      io?.emit("periodCancelled", { periodId: pid });
      await notify(io, {
        audience: "user",
        type: "session.cancelled",
        title: period.title ? `${period.title} cancelled` : "Voting session cancelled",
        message: "This election has been cancelled before it started.",
        scope: period.scope || "global",
        scopeState: period.scope !== "national" ? (period.scopeState || null) : null,
        scopeLGA: period.scope === "local" ? (period.scopeLGA || null) : null,
        periodId: pid,
        metadata: {
          periodId: pid,
          title: period.title || null,
          startTime: new Date(period.startTime).toISOString(),
          endTime: new Date(period.endTime).toISOString(),
          status: "cancelled",
        },
      });
      await notifyAdminAction(io, req, {
        type: "admin.session.cancelled",
        title: "Session cancelled",
        message: `${actorLabel(req.user)} cancelled ${period.title || `session #${pid}`} before it started.`,
        scope: "global",
        periodId: pid,
        metadata: {
          periodId: pid,
          startTime: new Date(period.startTime).toISOString(),
        },
      });
      emailService
        .sendSessionLifecycleEmail("cancelled", { ...period, status: "cancelled" })
        .catch((err) => {
          console.error("admin/cancel email", err);
        });
      res.json({ success: true, periodId: pid });
    } catch (err) {
      console.error("admin/periods/cancel:", err);
      res.status(500).json({ error: "SERVER", message: "Could not cancel voting period" });
    }
  });

  router.put("/voting-period/:id", requireAuth, requireRole(["super-admin"]), async (req, res) => {
    try {
      const pid = Number(req.params.id || 0);
      if (!pid) return res.status(400).json({ error: "MISSING_ID" });
      const {
        title,
        description,
        minAge,
        scope,
        scopeState,
        scopeLGA,
        startTime,
        endTime,
      } = req.body || {};
      const [[period]] = await q(`SELECT * FROM VotingPeriod WHERE id=?`, [pid]);
      if (!period) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
      if (new Date(period.startTime).getTime() <= Date.now()) {
        return res.status(409).json({ error: "ALREADY_STARTED", message: "This session has already started and cannot be edited. End it early instead." });
      }
      const next = {
        title: title !== undefined ? String(title).trim() || null : period.title,
        description: description !== undefined ? String(description).trim() || null : period.description,
        minAge: Math.max(Number(minAge ?? period.minAge ?? 18), 18),
        scope: (scope || period.scope || "national").toLowerCase(),
        scopeState: scopeState !== undefined ? (scopeState || null) : (period.scopeState || null),
        scopeLGA: scopeLGA !== undefined ? (scopeLGA || null) : (period.scopeLGA || null),
        startTime: startTime ? new Date(startTime) : new Date(period.startTime),
        endTime: endTime ? new Date(endTime) : new Date(period.endTime),
      };
      if (Number.isNaN(next.startTime.getTime()) || Number.isNaN(next.endTime.getTime())) {
        return res.status(400).json({ error: "INVALID_DATE", message: "Provide valid start and end times." });
      }
      if (next.endTime.getTime() <= next.startTime.getTime()) {
        return res.status(400).json({ error: "INVALID_RANGE", message: "End time must be after start time." });
      }
      const normalizedScope = next.scope || "national";
      if (!["national", "state", "local"].includes(normalizedScope)) {
        return res.status(400).json({ error: "INVALID_SCOPE", message: "Scope must be national, state, or local." });
      }
      if (normalizedScope !== "national" && !next.scopeState) {
        return res.status(400).json({ error: "MISSING_SCOPE", message: "State is required for non-national scopes." });
      }
      if (normalizedScope === "local" && !next.scopeLGA) {
        return res.status(400).json({ error: "MISSING_SCOPE", message: "LGA is required for local scope." });
      }

      const [attachedCandidates] = await q(
        `SELECT name, state, lga FROM Candidates WHERE periodId=?`,
        [pid]
      );
      if (Array.isArray(attachedCandidates) && attachedCandidates.length) {
        const normalize = (value) => (value || "").trim().toLowerCase();
        const targetState = normalize(next.scopeState);
        const targetLga = normalize(next.scopeLGA);
        const mismatched = attachedCandidates.filter((candidate) => {
          if (normalizedScope === "national") return false;
          const candState = normalize(candidate.state);
          if (!candState || candState !== targetState) return true;
          if (normalizedScope === "local") {
            const candLga = normalize(candidate.lga);
            if (!candLga || candLga !== targetLga) return true;
          }
          return false;
        });
        if (mismatched.length) {
          return res.status(409).json({
            error: "SCOPE_MISMATCH",
            message: `The following candidates do not match the updated scope: ${mismatched.map((c) => c.name).join(", ")}`,
          });
        }
      }

      await q(
        `UPDATE VotingPeriod
         SET title=?, description=?, minAge=?, scope=?, scopeState=?, scopeLGA=?, startTime=?, endTime=?
         WHERE id=?`,
        [
          next.title,
          next.description,
          next.minAge,
          normalizedScope,
          normalizedScope === "national" ? null : next.scopeState,
          normalizedScope === "local" ? next.scopeLGA : null,
          next.startTime,
          next.endTime,
          pid,
        ]
      );

      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "").toLowerCase() || null,
        action: "session.updated",
        entityType: "votingPeriod",
        entityId: String(pid),
        before: {
          title: period.title,
          description: period.description,
          minAge: period.minAge,
          scope: period.scope,
          scopeState: period.scopeState,
          scopeLGA: period.scopeLGA,
          startTime: period.startTime,
          endTime: period.endTime,
        },
        after: {
          title: next.title,
          description: next.description,
          minAge: next.minAge,
          scope: normalizedScope,
          scopeState: normalizedScope === "national" ? null : next.scopeState,
          scopeLGA: normalizedScope === "local" ? next.scopeLGA : null,
          startTime: next.startTime,
          endTime: next.endTime,
        },
      });

      const io = req.app.get("io");
      io?.emit("periodUpdated", { periodId: pid });
      await notify(io, {
        audience: "user",
        type: "session.updated",
        title: next.title ? `${next.title} updated` : "Voting session updated",
        message: "Session details were updated by an administrator.",
        scope: normalizedScope || "global",
        scopeState: normalizedScope !== "national" ? (next.scopeState || null) : null,
        scopeLGA: normalizedScope === "local" ? (next.scopeLGA || null) : null,
        periodId: pid,
        metadata: {
          periodId: pid,
          title: next.title || null,
          previous: {
            startTime: new Date(period.startTime).toISOString(),
            endTime: new Date(period.endTime).toISOString(),
            scope: period.scope,
            scopeState: period.scopeState,
            scopeLGA: period.scopeLGA,
            minAge: period.minAge,
          },
          next: {
            startTime: next.startTime.toISOString(),
            endTime: next.endTime.toISOString(),
            scope: normalizedScope,
            scopeState: normalizedScope !== "national" ? (next.scopeState || null) : null,
            scopeLGA: normalizedScope === "local" ? (next.scopeLGA || null) : null,
            minAge: next.minAge,
          },
        },
      });
      await notifyAdminAction(io, req, {
        type: "admin.session.updated",
        title: "Session updated",
        message: `${actorLabel(req.user)} updated ${next.title || `session #${pid}`}.`,
        scope: "global",
        periodId: pid,
        metadata: {
          periodId: pid,
        },
      });
      res.json({ success: true, id: pid });
    } catch (err) {
      console.error("admin/periods/update:", err);
      res.status(500).json({ error: "SERVER", message: "Could not update voting period" });
    }
  });

  router.post("/end-voting-early", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const pid = Number(req.body?.periodId || 0);
      let period = null;

      if (pid) {
        const [[row]] = await q(
          `SELECT id, title, startTime, endTime, scope, scopeState, scopeLGA, forcedEnded, resultsPublished
           FROM VotingPeriod WHERE id=?`,
          [pid]
        );
        if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
        if (!periodMatchesScope(scopeInfo, row)) {
          return res.status(403).json({ error: "FORBIDDEN", message: "You do not have access to this session." });
        }
        period = row;
      } else {
        let sql = `
          SELECT id, title, startTime, endTime, scope, scopeState, scopeLGA, forcedEnded, resultsPublished
            FROM VotingPeriod
           WHERE forcedEnded=0
             AND resultsPublished=0
             AND endTime > UTC_TIMESTAMP()
        `;
        const params = [];
        if (!scopeInfo.isSuper) {
          sql += ` AND LOWER(COALESCE(scope,'')) <> 'national' AND LOWER(COALESCE(scopeState,'')) = ?`;
          params.push(toKey(scopeInfo.state));
        }
        sql += ` ORDER BY endTime ASC LIMIT 1`;
        const [[row]] = await q(sql, params);
        if (!row) return res.json({ success: true, already: true });
        period = row;
      }

      if (period.forcedEnded || period.resultsPublished) {
        return res.json({ success: true, already: true, periodId: period.id });
      }

      await q(`UPDATE VotingPeriod SET forcedEnded=1 WHERE id=?`, [period.id]);
      const io = req.app.get("io");
      io?.emit("periodEnded", { periodId: period.id, forced: true });
      await notify(io, {
        audience: "user",
        type: "session.ended",
        title: period.title ? `${period.title} ended early` : "Voting session ended",
        message: "Administrators ended this election ahead of schedule.",
        scope: period.scope || "global",
        scopeState: period.scope !== "national" ? (period.scopeState || null) : null,
        scopeLGA: period.scope === "local" ? (period.scopeLGA || null) : null,
        periodId: period.id,
        metadata: {
          periodId: period.id,
          title: period.title || null,
          scheduledEndTime: new Date(period.endTime).toISOString(),
          endedAt: new Date().toISOString(),
          forced: true,
        },
      });
      period.forcedEnded = 1;
      emailService.sendSessionLifecycleEmail("ended", period).catch((err) => {
        console.error("admin/end-early email", err);
      });
      await q(`UPDATE VotingPeriod SET notifyEndedAt=UTC_TIMESTAMP() WHERE id=?`, [period.id]);
      await notifyAdminAction(io, req, {
        type: "admin.session.ended",
        title: "Session ended early",
        message: `${actorLabel(req.user)} ended ${period.title || `session #${period.id}`} ahead of schedule.`,
        scope: "global",
        periodId: period.id,
        metadata: {
          periodId: period.id,
          scheduledEndTime: new Date(period.endTime).toISOString(),
          endedAt: new Date().toISOString(),
          forced: true,
        },
      });
      res.json({ success: true, periodId: period.id });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/end-early:", err);
      res.status(500).json({ error: "SERVER", message: "Could not end voting early" });
    }
  });

  router.post("/publish-results", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const pid = Number(req.body?.periodId || 0);
      let period = null;

      if (pid) {
        const [[row]] = await q(
          `SELECT id, title, endTime, scope, scopeState, scopeLGA, resultsPublished
           FROM VotingPeriod WHERE id=?`,
          [pid]
        );
        if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
        if (!periodMatchesScope(scopeInfo, row)) {
          return res.status(403).json({ error: "FORBIDDEN", message: "You do not have access to this session." });
        }
        period = row;
      } else {
        let sql = `
          SELECT id, title, endTime, scope, scopeState, scopeLGA, resultsPublished
            FROM VotingPeriod
           WHERE resultsPublished=0
             AND (forcedEnded=1 OR endTime <= UTC_TIMESTAMP())
        `;
        const params = [];
        if (!scopeInfo.isSuper) {
          sql += ` AND LOWER(COALESCE(scope,'')) <> 'national' AND LOWER(COALESCE(scopeState,'')) = ?`;
          params.push(toKey(scopeInfo.state));
        }
        sql += ` ORDER BY endTime DESC LIMIT 1`;
        const [[row]] = await q(sql, params);
        if (!row) return res.json({ success: true, already: true });
        period = row;
      }

      if (!periodMatchesScope(scopeInfo, period)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You do not have access to this session." });
      }

      if (period.resultsPublished) {
        return res.json({ success: true, already: true, periodId: period.id });
      }

      await q(`UPDATE VotingPeriod SET resultsPublished=1 WHERE id=?`, [period.id]);
      const io = req.app.get("io");
      io?.emit("resultsPublished", { periodId: period.id });
      await notify(io, {
        audience: "user",
        type: "results.published",
        title: period.title ? `${period.title} results published` : "Election results are now available",
        message: "Final tallies are ready to review.",
        scope: period.scope || "global",
        scopeState: period.scope !== "national" ? (period.scopeState || null) : null,
        scopeLGA: period.scope === "local" ? (period.scopeLGA || null) : null,
        periodId: period.id,
        metadata: {
          periodId: period.id,
          title: period.title || null,
          publishedAt: new Date().toISOString(),
          endTime: new Date(period.endTime).toISOString(),
        },
      });
      emailService.sendSessionLifecycleEmail("results", period).catch((err) => {
        console.error("admin/results email", err);
      });
      await q(`UPDATE VotingPeriod SET notifyResultsAt=UTC_TIMESTAMP() WHERE id=?`, [period.id]);
      await notifyAdminAction(io, req, {
        type: "admin.results.published",
        title: "Results published",
        message: `${actorLabel(req.user)} published results for ${period.title || `session #${period.id}`}.`,
        scope: "global",
        periodId: period.id,
        metadata: {
          periodId: period.id,
          publishedAt: new Date().toISOString(),
        },
      });
      res.json({ success: true, periodId: period.id });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/publish:", err);
      res.status(500).json({ error: "SERVER", message: "Could not publish results" });
    }
  });

  router.get("/audit", requireAuth, requireAdmin, async (req, res) => {
    try {
      const pid = Number(req.query.periodId || 0);
      if (!pid) return res.status(400).json({ error: "MISSING_ID" });
      const [[candCountRow]] = await q(`SELECT COUNT(*) AS c FROM Candidates WHERE periodId=?`, [pid]);
      const [[voteCountRow]] = await q(`SELECT COUNT(*) AS v FROM Votes WHERE periodId=?`, [pid]);
      const [[sumVotesRow]] = await q(`SELECT COALESCE(SUM(votes),0) AS s FROM Candidates WHERE periodId=?`, [pid]);
      res.json({
        candidateCount: candCountRow?.c || 0,
        voteRows: voteCountRow?.v || 0,
        candidateVotes: sumVotesRow?.s || 0,
        consistent: (voteCountRow?.v || 0) === (sumVotesRow?.s || 0),
      });
    } catch (err) {
      console.error("admin/audit:", err);
      res.status(500).json({ error: "SERVER" });
    }
  });
};
