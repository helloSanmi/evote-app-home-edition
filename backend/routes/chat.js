const express = require("express");
const router = express.Router();
const { q } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

function firstName(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.split("@")[0];
  return raw.split(/\s+/)[0];
}

async function findOpenSessionForUser(user) {
  const [[existing]] = await q(`SELECT TOP 1 * FROM ChatSession WHERE userId=? AND status <> 'closed' ORDER BY createdAt DESC`, [user.id]);
  return existing || null;
}

async function getOrCreateSessionForUser(user) {
  const existing = await findOpenSessionForUser(user);
  if (existing) return existing;
  const display = firstName(user.username || user.email || `User #${user.id}`);
  await q(
    `INSERT INTO ChatSession (userId, userName, status) VALUES (?,?, 'pending')`,
    [user.id, display || `User #${user.id}`]
  );
  const [[fresh]] = await q(`SELECT TOP 1 * FROM ChatSession WHERE userId=? ORDER BY createdAt DESC`, [user.id]);
  return fresh;
}

function rowToSession(row) {
  return {
    ...row,
    userName: firstName(row.userName || ""),
    assignedAdminName: firstName(row.assignedAdminName || ""),
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    lastMessageAt: row.lastMessageAt?.toISOString?.() || row.lastMessageAt,
  };
}

function rowToMessage(row) {
  return {
    ...row,
    senderName: firstName(row.senderName || ""),
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
  };
}

const botResponses = [
  {
    regex: /(reset|forgot).*password/i,
    reply: "You can reset your password via the login page using the \"Forgot password\" link. If the link fails, let me know and I'll alert an admin for manual help.",
  },
  {
    regex: /(create|launch).*session/i,
    reply: "To launch a voting session, open the Sessions tab, complete the scope, details, candidate staging, and schedule steps, then hit \"Launch session\".",
  },
  {
    regex: /(add|invite).*admin/i,
    reply: "Only super admins can invite or promote new admins. They can do this from the Users tab by creating a user and assigning the admin role.",
  },
  {
    regex: /(export).*user/i,
    reply: "Admins can export user details from the Users tab using the Export CSV button.",
  },
  {
    regex: /(where|how).*vote/i,
    reply: "Head to the Vote page, pick the active session from the list, and choose your preferred candidate. The platform will confirm once your ballot is received.",
  },
  {
    regex: /hello|hi|hey|good (morning|afternoon|evening)/i,
    reply: "Hi there! I'm the assistant for the voting platform. Ask me about passwords, sessions, or how to vote. If you need deeper help, I'll bring an admin in.",
  },
  {
    regex: /(support|contact).*team/i,
    reply: "You can reach our support team here. Share a few details and I can either guide you or invite an admin to join.",
  },
  {
    regex: /(update|change).*profile/i,
    reply: "To update your profile, open the Profile page from the menu and edit your personal details. Remember to save once you're done.",
  },
  {
    regex: /(can't|cannot|can not).*find.*session/i,
    reply: "If you can't find your session, head to the Sessions tab and make sure the election is active for your location. Refreshing the page can help too.",
  },
  {
    regex: /(result|outcome|winner).*session/i,
    reply: "You can view published election results under the Results tab. Pick a session to see winners, vote counts, and scope details.",
  },
  {
    regex: /(eligible|qualification|who can vote)/i,
    reply: "Eligibility depends on the election scope. Make sure your state and LGA match the session scope and that you're at least 18.",
  },
  {
    regex: /(reset).*email|change.*email/i,
    reply: "If you need to change the email tied to your account, contact an admin. Tell me you'd like a human agent and I'll invite one in.",
  },
];

function getBotReply(message) {
  if (!message) return null;
  for (const item of botResponses) {
    if (item.regex.test(message)) return item.reply;
  }
  return null;
}

const escalationRegex = /(agent|human|support|person|representative|someone|supervisor)/i;
const fallbackEscalationReply = "I'll loop in a human support agent now. They'll join the conversation shortly.";
const assistantDefaultReply = "I'm still learning. Ask me about voting sessions, passwords, or results. If you need a person, just say you'd like a human agent.";

function shouldEscalateToHuman(message) {
  if (!message) return false;
  return escalationRegex.test(message);
}

router.get("/session", requireAuth, async (req, res) => {
  try {
    const raw = (req.query?.create ?? "").toString().toLowerCase();
    const allowCreate = ["1", "true", "yes", "auto"].includes(raw);
    let session = await findOpenSessionForUser(req.user);
    if (!session && allowCreate) {
      session = await getOrCreateSessionForUser(req.user);
    }
    if (!session) return res.json({ session: null, messages: [] });
    const [messages] = await q(`SELECT id, sessionId, senderType, senderId, senderName, body, createdAt FROM ChatMessage WHERE sessionId=? ORDER BY createdAt ASC`, [session.id]);
    res.json({ session: rowToSession(session), messages: messages.map(rowToMessage) });
  } catch (e) {
    console.error("chat/session:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/message", requireAuth, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: "MISSING_MESSAGE" });
    const session = await getOrCreateSessionForUser(req.user);
    const body = message.trim();
    const senderName = firstName(req.user.username || req.user.email || `User #${req.user.id}`) || `User #${req.user.id}`;
    await q(`INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`, [
      session.id,
      "user",
      req.user.id,
      senderName,
      body,
    ]);
    const wantsHuman = shouldEscalateToHuman(body);
    const hasAdmin = Boolean(session.assignedAdminId);
    const botReply = !hasAdmin && !wantsHuman ? getBotReply(body) : null;
    const [[lastBot]] = await q(`SELECT TOP 1 senderType, body FROM ChatMessage WHERE sessionId=? AND senderType='bot' ORDER BY id DESC`, [session.id]);
    const alreadySentDefault = lastBot?.body === assistantDefaultReply;
    const shouldEscalate = wantsHuman;
    const nextStatus = hasAdmin ? "active" : shouldEscalate ? "pending" : "bot";
    await q(`UPDATE ChatSession SET lastMessageAt=SYSUTCDATETIME(), status=? WHERE id=?`, [nextStatus, session.id]);

    const [[created]] = await q(`SELECT TOP 1 * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC`, [session.id]);
    const payload = { ...rowToMessage(created), sessionId: session.id };
    const io = req.app.get("io");
    io?.to(`chat:${session.id}`).emit("chat:message", payload);
    io?.emit("chat:sessions:update");

    io?.to(`chat:${session.id}`).emit("chat:session:update", { id: session.id, status: nextStatus });

    let botPayload = null;
    if (botReply) {
      await q(`INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`, [
        session.id,
        "bot",
        null,
        "Assistant",
        botReply,
      ]);
      await q(`UPDATE ChatSession SET lastMessageAt=SYSUTCDATETIME() WHERE id=?`, [session.id]);
      const [[botMessage]] = await q(`SELECT TOP 1 * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC`, [session.id]);
      botPayload = { ...rowToMessage(botMessage), sessionId: session.id };
      io?.to(`chat:${session.id}`).emit("chat:message", botPayload);
    } else if (!hasAdmin && !wantsHuman && !alreadySentDefault) {
      await q(`INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`, [
        session.id,
        "bot",
        null,
        "Assistant",
        assistantDefaultReply,
      ]);
      await q(`UPDATE ChatSession SET lastMessageAt=SYSUTCDATETIME() WHERE id=?`, [session.id]);
      const [[defaultMessage]] = await q(`SELECT TOP 1 * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC`, [session.id]);
      botPayload = { ...rowToMessage(defaultMessage), sessionId: session.id };
      io?.to(`chat:${session.id}`).emit("chat:message", botPayload);
    } else if (!hasAdmin && shouldEscalate) {
      await q(`INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`, [
        session.id,
        "bot",
        null,
        "Assistant",
        fallbackEscalationReply,
      ]);
      await q(`UPDATE ChatSession SET lastMessageAt=SYSUTCDATETIME() WHERE id=?`, [session.id]);
      const [[escalationMessage]] = await q(`SELECT TOP 1 * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC`, [session.id]);
      botPayload = { ...rowToMessage(escalationMessage), sessionId: session.id };
      io?.to(`chat:${session.id}`).emit("chat:message", botPayload);
    }
    res.json({ success: true, message: payload, sessionId: session.id });
  } catch (e) {
    console.error("chat/message:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/sessions", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
  try {
    const { status } = req.query || {};
    let where = "";
    const params = [];
    if (status && ["pending", "active", "closed", "bot"].includes(status.toLowerCase())) {
      where = "WHERE status=?";
      params.push(status.toLowerCase());
    }
    const [rows] = await q(
      `SELECT TOP 50 id, userId, userName, status, assignedAdminId, assignedAdminName, lastMessageAt, createdAt
       FROM ChatSession ${where}
       ORDER BY lastMessageAt DESC`,
      params
    );
    res.json(rows.map(rowToSession));
  } catch (e) {
    console.error("chat/sessions:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/sessions/:id", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
  try {
    const sid = Number(req.params.id || 0);
    if (!sid) return res.status(400).json({ error: "MISSING_ID" });
    const [[session]] = await q(`SELECT * FROM ChatSession WHERE id=?`, [sid]);
    if (!session) return res.status(404).json({ error: "NOT_FOUND" });
    const [messages] = await q(`SELECT * FROM ChatMessage WHERE sessionId=? ORDER BY createdAt ASC`, [sid]);
    res.json({ session: rowToSession(session), messages: messages.map(rowToMessage) });
  } catch (e) {
    console.error("chat/sessions/id:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/sessions/:id/assign", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
  try {
    const sid = Number(req.params.id || 0);
    if (!sid) return res.status(400).json({ error: "MISSING_ID" });
    const [[session]] = await q(`SELECT * FROM ChatSession WHERE id=?`, [sid]);
    if (!session) return res.status(404).json({ error: "NOT_FOUND" });
    const adminName = firstName(req.user.username || req.user.email || `Admin #${req.user.id}`) || `Admin #${req.user.id}`;
    await q(
      `UPDATE ChatSession SET assignedAdminId=?, assignedAdminName=?, status='active', lastMessageAt=SYSUTCDATETIME() WHERE id=?`,
      [req.user.id, adminName, sid]
    );
    const [[updated]] = await q(`SELECT * FROM ChatSession WHERE id=?`, [sid]);
    const io = req.app.get("io");
    io?.emit("chat:sessions:update");
    io?.to(`chat:${sid}`).emit("chat:session:update", rowToSession(updated));
    res.json({ success: true, session: rowToSession(updated) });
  } catch (e) {
    console.error("chat/sessions/assign:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/sessions/:id/message", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
  try {
    const sid = Number(req.params.id || 0);
    const { message } = req.body || {};
    if (!sid) return res.status(400).json({ error: "MISSING_ID" });
    if (!message || !message.trim()) return res.status(400).json({ error: "MISSING_MESSAGE" });
    const [[session]] = await q(`SELECT * FROM ChatSession WHERE id=?`, [sid]);
    if (!session) return res.status(404).json({ error: "NOT_FOUND" });
    const senderName = firstName(req.user.username || req.user.email || `Admin #${req.user.id}`) || `Admin #${req.user.id}`;
    await q(
      `INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`,
      [sid, "admin", req.user.id, senderName, message.trim()]
    );
    await q(`UPDATE ChatSession SET status='active', assignedAdminId=COALESCE(assignedAdminId, ?), assignedAdminName=COALESCE(assignedAdminName, ?), lastMessageAt=SYSUTCDATETIME() WHERE id=?`, [
      req.user.id,
      senderName,
      sid,
    ]);
    const [[created]] = await q(`SELECT TOP 1 * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC`, [sid]);
    const payload = { ...rowToMessage(created), sessionId: sid };
    const io = req.app.get("io");
    io?.to(`chat:${sid}`).emit("chat:message", payload);
    io?.emit("chat:sessions:update");
    res.json({ success: true, message: payload });
  } catch (e) {
    console.error("chat/sessions/message:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/sessions/:id/close", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
  try {
    const sid = Number(req.params.id || 0);
    if (!sid) return res.status(400).json({ error: "MISSING_ID" });
    await q(`UPDATE ChatSession SET status='closed', lastMessageAt=SYSUTCDATETIME() WHERE id=?`, [sid]);
    const io = req.app.get("io");
    io?.emit("chat:sessions:update");
    io?.to(`chat:${sid}`).emit("chat:session:update", { id: sid, status: 'closed' });
    res.json({ success: true });
  } catch (e) {
    console.error("chat/sessions/close:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.delete("/sessions/:id", requireAuth, requireRole(["super-admin"]), async (req, res) => {
  try {
    const sid = Number(req.params.id || 0);
    if (!sid) return res.status(400).json({ error: "MISSING_ID" });
    const [[session]] = await q(`SELECT id FROM ChatSession WHERE id=?`, [sid]);
    if (!session) return res.status(404).json({ error: "NOT_FOUND" });
    await q(`DELETE FROM ChatMessage WHERE sessionId=?`, [sid]);
    await q(`DELETE FROM ChatSession WHERE id=?`, [sid]);
    const io = req.app.get("io");
    io?.emit("chat:sessions:update");
    io?.to(`chat:${sid}`).emit("chat:session:update", { id: sid, status: "deleted" });
    res.json({ success: true });
  } catch (e) {
    console.error("chat/sessions/delete:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/session/history", requireAuth, async (req, res) => {
  try {
    const [rows] = await q(`SELECT TOP 20 id, status, assignedAdminName, lastMessageAt, createdAt FROM ChatSession WHERE userId=? ORDER BY createdAt DESC`, [req.user.id]);
    res.json({ sessions: rows.map(rowToSession) });
  } catch (e) {
    console.error("chat/session/history:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/session/:id", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.id || 0);
    if (!sid) return res.status(400).json({ error: "MISSING_ID" });
    const [[session]] = await q(`SELECT * FROM ChatSession WHERE id=? AND userId=?`, [sid, req.user.id]);
    if (!session) return res.status(404).json({ error: "NOT_FOUND" });
    const [messages] = await q(`SELECT id, sessionId, senderType, senderId, senderName, body, createdAt FROM ChatMessage WHERE sessionId=? ORDER BY createdAt ASC`, [sid]);
    res.json({ session: rowToSession(session), messages: messages.map(rowToMessage) });
  } catch (e) {
    console.error("chat/session/id:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/session/close", requireAuth, async (req, res) => {
  try {
    const session = await findOpenSessionForUser(req.user);
    if (!session) return res.status(404).json({ error: "NO_OPEN_SESSION", message: "No active conversation to close" });
    await q(`UPDATE ChatSession SET status='closed', lastMessageAt=SYSUTCDATETIME() WHERE id=?`, [session.id]);
    const io = req.app.get("io");
    io?.emit("chat:sessions:update");
    io?.to(`chat:${session.id}`).emit("chat:session:update", { id: session.id, status: 'closed' });
    res.json({ success: true });
  } catch (e) {
    console.error("chat/session/close:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

module.exports = router;
