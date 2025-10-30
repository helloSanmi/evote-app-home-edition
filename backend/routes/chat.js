const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { q } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const STATUS_ONLINE = "online";
const STATUS_OFFLINE = "offline";
const VALID_STATUS = new Set([STATUS_ONLINE, STATUS_OFFLINE]);

function firstName(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.split("@")[0];
  return raw.split(/\s+/)[0];
}

async function findOpenSessionForUser(user) {
  const [[existing]] = await q(`SELECT * FROM ChatSession WHERE userId=? AND status <> 'closed' ORDER BY createdAt DESC LIMIT 1`, [user.id]);
  return existing || null;
}

async function getOrCreateSessionForUser(user) {
  const existing = await findOpenSessionForUser(user);
  if (existing) return existing;
  const display = firstName(user.username || user.email || `User #${user.id}`);
  const [result] = await q(
    `INSERT INTO ChatSession (userId, userName, status) VALUES (?,?, 'pending')`,
    [user.id, display || `User #${user.id}`]
  );
  const [[fresh]] = await q(`SELECT * FROM ChatSession WHERE id=? LIMIT 1`, [result.insertId]);
  return fresh;
}

async function getAdminChatStatus(userId) {
  const [[row]] = await q(
    `SELECT chatStatus FROM Users WHERE id=? LIMIT 1`,
    [userId]
  );
  return row?.chatStatus || STATUS_OFFLINE;
}

async function setAdminChatStatus(userId, status) {
  await q(`UPDATE Users SET chatStatus=? WHERE id=?`, [status, userId]);
  return status;
}

async function getOnlineAdminCount() {
  const [[row]] = await q(
    `SELECT COUNT(*) AS onlineCount
     FROM Users
     WHERE (role IN ('admin','super-admin') OR isAdmin=1)
       AND chatStatus='online'`
  );
  return Number(row?.onlineCount || 0);
}

function rowToSession(row, { guestToken } = {}) {
  const rawUserName = row.userName || "";
  const rawAdminName = row.assignedAdminName || "";
  const session = {
    ...row,
    userName: firstName(rawUserName),
    userDisplayName: rawUserName,
    assignedAdminName: firstName(rawAdminName),
    assignedAdminDisplayName: rawAdminName,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    lastMessageAt: row.lastMessageAt?.toISOString?.() || row.lastMessageAt,
  };
  if (guestToken !== undefined) session.guestToken = guestToken;
  return session;
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
    regex: /(reset|forgot|change).*password/i,
    reply: "You can update your password from the Profile page under Security, or use the “Forgot password” link on the login screen. If an admin sent you a temporary password, sign in and follow the prompt to set a new one right away.",
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
    reply: "If you can't find your session, open the Sessions tab (or Vote page for voters) and ensure the scope matches your state/LGA. Refreshing the page or clearing the filters in the Results/Upcoming lists often helps.",
  },
  {
    regex: /(candidate).*(info|information|details|profile)/i,
    reply: "Admins can review or edit candidate details from the staging area in Sessions before publishing. Voters will see each candidate’s bio and photo on the ballot card. Update the record and hit save to push fresh information live.",
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

function generateGuestToken() {
  return crypto.randomBytes(18).toString("hex");
}

router.get("/admin/status", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
  try {
    const status = await getAdminChatStatus(req.user.id);
    res.json({ status });
  } catch (err) {
    console.error("chat/admin/status:get", err);
    res.status(500).json({ error: "SERVER", message: "Could not load chat status" });
  }
});

router.post("/admin/status", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
  try {
    const input = String(req.body?.status || "").toLowerCase();
    if (!VALID_STATUS.has(input)) {
      return res.status(400).json({ error: "INVALID_STATUS", message: "Status must be online or offline" });
    }
    const status = await setAdminChatStatus(req.user.id, input);
    req.app.get("io")?.emit("chat:availability-change", { adminId: req.user.id, status });
    res.json({ status });
  } catch (err) {
    console.error("chat/admin/status:post", err);
    res.status(500).json({ error: "SERVER", message: "Could not update chat status" });
  }
});

router.get("/availability", async (_req, res) => {
  try {
    const onlineAdmins = await getOnlineAdminCount();
    res.json({ onlineAdmins });
  } catch (err) {
    console.error("chat/availability:get", err);
    res.status(500).json({ error: "SERVER", message: "Could not determine availability" });
  }
});

async function findGuestSessionByToken(token) {
  if (!token) return null;
  const [[row]] = await q(
    `SELECT s.*, g.token
     FROM ChatGuestToken g
     JOIN ChatSession s ON s.id = g.sessionId
     WHERE g.token=?
     ORDER BY s.createdAt DESC
     LIMIT 1`,
    [token]
  );
  if (!row) return null;
  const { token: storedToken, ...session } = row;
  return { session, token: storedToken };
}

async function createGuestSession(name) {
  const token = generateGuestToken();
  const cleaned = (name || "").trim();
  const [result] = await q(
    `INSERT INTO ChatSession (userId, userName, status)
     VALUES (NULL, ?, 'pending')`,
    [cleaned]
  );
  const sessionId = result.insertId;
  await q(`INSERT INTO ChatGuestToken (sessionId, token) VALUES (?, ?)`, [sessionId, token]);
  const [[session]] = await q(`SELECT * FROM ChatSession WHERE id=? LIMIT 1`, [sessionId]);
  return { session, token };
}

async function recordInboundMessage({ session, body, senderType, senderId, senderName, io }) {
  const trimmed = body.trim();
  await q(`INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`, [
    session.id,
    senderType,
    senderId || null,
    senderName,
    trimmed,
  ]);
  const wantsHuman = shouldEscalateToHuman(trimmed);
  const hasAdmin = Boolean(session.assignedAdminId);
  const botReply = !hasAdmin && !wantsHuman ? getBotReply(trimmed) : null;
  const [[lastBot]] = await q(`SELECT senderType, body FROM ChatMessage WHERE sessionId=? AND senderType='bot' ORDER BY id DESC LIMIT 1`, [session.id]);
  const alreadySentDefault = lastBot?.body === assistantDefaultReply;
  const shouldEscalate = wantsHuman;
  const nextStatus = hasAdmin ? "active" : shouldEscalate ? "pending" : "bot";
  await q(`UPDATE ChatSession SET lastMessageAt=UTC_TIMESTAMP(), status=? WHERE id=?`, [nextStatus, session.id]);

  const [[created]] = await q(`SELECT * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC LIMIT 1`, [session.id]);
  const payload = { ...rowToMessage(created), sessionId: session.id };
  io?.to(`chat:${session.id}`).emit("chat:message", payload);
  io?.emit("chat:sessions:update");
  io?.to(`chat:${session.id}`).emit("chat:session:update", { id: session.id, status: nextStatus });

  if (botReply) {
    await q(`INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`, [
      session.id,
      "bot",
      null,
      "Assistant",
      botReply,
    ]);
    await q(`UPDATE ChatSession SET lastMessageAt=UTC_TIMESTAMP() WHERE id=?`, [session.id]);
    const [[botMessage]] = await q(`SELECT * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC LIMIT 1`, [session.id]);
    const botPayload = { ...rowToMessage(botMessage), sessionId: session.id };
    io?.to(`chat:${session.id}`).emit("chat:message", botPayload);
    return { payload, nextStatus };
  }

  if (!hasAdmin && !wantsHuman && !alreadySentDefault) {
    await q(`INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`, [
      session.id,
      "bot",
      null,
      "Assistant",
      assistantDefaultReply,
    ]);
    await q(`UPDATE ChatSession SET lastMessageAt=UTC_TIMESTAMP() WHERE id=?`, [session.id]);
    const [[defaultMessage]] = await q(`SELECT * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC LIMIT 1`, [session.id]);
    const botPayload = { ...rowToMessage(defaultMessage), sessionId: session.id };
    io?.to(`chat:${session.id}`).emit("chat:message", botPayload);
    return { payload, nextStatus };
  }

  if (!hasAdmin && shouldEscalate) {
    await q(`INSERT INTO ChatMessage (sessionId, senderType, senderId, senderName, body) VALUES (?,?,?,?,?)`, [
      session.id,
      "bot",
      null,
      "Assistant",
      fallbackEscalationReply,
    ]);
    await q(`UPDATE ChatSession SET lastMessageAt=UTC_TIMESTAMP() WHERE id=?`, [session.id]);
    const [[escalationMessage]] = await q(`SELECT * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC LIMIT 1`, [session.id]);
    const botPayload = { ...rowToMessage(escalationMessage), sessionId: session.id };
    io?.to(`chat:${session.id}`).emit("chat:message", botPayload);
  }

  return { payload, nextStatus };
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
    const senderName = firstName(req.user.username || req.user.email || `User #${req.user.id}`) || `User #${req.user.id}`;
    const io = req.app.get("io");
    const { payload, nextStatus } = await recordInboundMessage({
      session,
      body: message,
      senderType: "user",
      senderId: req.user.id,
      senderName,
      io,
    });
    session.status = nextStatus;
    res.json({ success: true, message: payload, sessionId: session.id });
  } catch (e) {
    console.error("chat/message:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/guest/session", async (req, res) => {
  try {
    const rawName = (req.body?.name || "").trim();
    if (!rawName) return res.status(400).json({ error: "MISSING_NAME", message: "Enter your full name to start chatting." });
    const wordCount = rawName.split(/\s+/).filter(Boolean).length;
    if (wordCount < 2) {
      return res.status(400).json({ error: "INVALID_NAME", message: "Please provide your full name so we can assist you properly." });
    }
    const { session, token } = await createGuestSession(rawName);
    res.json({
      token,
      session: rowToSession(session, { guestToken: token }),
      messages: [],
    });
  } catch (e) {
    console.error("chat/guest/session:create", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/guest/session", async (req, res) => {
  try {
    const token = (req.query?.token || "").trim();
    if (!token) return res.status(400).json({ error: "MISSING_TOKEN", message: "Missing chat reference." });
    const found = await findGuestSessionByToken(token);
    if (!found) return res.status(404).json({ error: "NOT_FOUND", message: "Guest chat not found." });
    const { session, token: storedToken } = found;
    const [messages] = await q(`SELECT id, sessionId, senderType, senderId, senderName, body, createdAt FROM ChatMessage WHERE sessionId=? ORDER BY createdAt ASC`, [session.id]);
    res.json({
      session: rowToSession(session, { guestToken: storedToken }),
      messages: messages.map(rowToMessage),
    });
  } catch (e) {
    console.error("chat/guest/session:get", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/guest/message", async (req, res) => {
  try {
    const { token, message } = req.body || {};
    const trimmedToken = (token || "").trim();
    if (!trimmedToken) return res.status(400).json({ error: "MISSING_TOKEN", message: "Missing chat reference." });
    if (!message || !message.trim()) return res.status(400).json({ error: "MISSING_MESSAGE" });
    const found = await findGuestSessionByToken(trimmedToken);
    if (!found) return res.status(404).json({ error: "NOT_FOUND", message: "Guest chat not found." });
    const { session } = found;
    if (session.status === "closed") return res.status(409).json({ error: "CHAT_CLOSED", message: "This conversation is closed. Start a new chat if you need more help." });
    const senderName = session.userName || "Guest";
    const io = req.app.get("io");
    const { payload, nextStatus } = await recordInboundMessage({
      session,
      body: message,
      senderType: "guest",
      senderId: null,
      senderName,
      io,
    });
    session.status = nextStatus;
    res.json({ success: true, message: payload, sessionId: session.id });
  } catch (e) {
    console.error("chat/guest/message:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/guest/session/close", async (req, res) => {
  try {
    const token = (req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "MISSING_TOKEN", message: "Missing chat reference." });
    const found = await findGuestSessionByToken(token);
    if (!found) return res.status(404).json({ error: "NOT_FOUND", message: "Guest chat not found." });
    const { session } = found;
    if (session.status === "closed") return res.json({ success: true });
    await q(`UPDATE ChatSession SET status='closed', lastMessageAt=UTC_TIMESTAMP() WHERE id=?`, [session.id]);
    const io = req.app.get("io");
    io?.emit("chat:sessions:update");
    io?.to(`chat:${session.id}`).emit("chat:session:update", { id: session.id, status: "closed" });
    res.json({ success: true });
  } catch (e) {
    console.error("chat/guest/session/close:", e);
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
      `SELECT id, userId, userName, status, assignedAdminId, assignedAdminName, lastMessageAt, createdAt
       FROM ChatSession ${where}
       ORDER BY lastMessageAt DESC
       LIMIT 50`,
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
      `UPDATE ChatSession SET assignedAdminId=?, assignedAdminName=?, status='active', lastMessageAt=UTC_TIMESTAMP() WHERE id=?`,
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
    await q(`UPDATE ChatSession SET status='active', assignedAdminId=COALESCE(assignedAdminId, ?), assignedAdminName=COALESCE(assignedAdminName, ?), lastMessageAt=UTC_TIMESTAMP() WHERE id=?`, [
      req.user.id,
      senderName,
      sid,
    ]);
    const [[created]] = await q(`SELECT * FROM ChatMessage WHERE sessionId=? ORDER BY id DESC LIMIT 1`, [sid]);
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
    await q(`UPDATE ChatSession SET status='closed', lastMessageAt=UTC_TIMESTAMP() WHERE id=?`, [sid]);
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
    const [rows] = await q(`SELECT id, status, assignedAdminName, lastMessageAt, createdAt FROM ChatSession WHERE userId=? ORDER BY createdAt DESC LIMIT 20`, [req.user.id]);
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
    await q(`UPDATE ChatSession SET status='closed', lastMessageAt=UTC_TIMESTAMP() WHERE id=?`, [session.id]);
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
