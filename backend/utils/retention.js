const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { q } = require("../db");
const { recordAuditEvent } = require("./audit");
const { ensureDirSync, uploadRoot, removeFromObjectStorage } = require("./uploads");

const DAY_MS = 24 * 60 * 60 * 1000;
const PROFILE_DIR = ensureDirSync("profile");
const CANDIDATE_DIR = ensureDirSync("candidates");

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn("[retention] Failed to remove file:", filePath, err.message);
  }
}

async function cleanupChatHistory() {
  try {
    await q(`DELETE FROM ChatMessage WHERE createdAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`);
    await q(`DELETE FROM ChatSession WHERE GREATEST(IFNULL(lastMessageAt, createdAt), createdAt) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`);
  } catch (err) {
    console.error("[retention] chat cleanup failed:", err?.message || err);
  }
}

async function cleanupOldUploads() {
  const cutoff = Date.now() - 30 * DAY_MS;
  try {
    const [rows] = await q(`SELECT profilePhoto FROM Users WHERE profilePhoto IS NOT NULL`);
    const activePhotos = new Set(rows.map((r) => r.profilePhoto));
    if (fs.existsSync(PROFILE_DIR)) {
      for (const file of fs.readdirSync(PROFILE_DIR)) {
        const fullPath = path.join(PROFILE_DIR, file);
        if (!fs.statSync(fullPath).isFile()) continue;
        const rel = `/uploads/profile/${file}`;
        if (activePhotos.has(rel)) continue;
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs < cutoff) {
          await removeFromObjectStorage(rel.replace("/uploads/", ""));
          safeUnlink(fullPath);
        }
      }
    }
  } catch (err) {
    console.error("[retention] profile cleanup failed:", err?.message || err);
  }

  try {
    const [rows] = await q(`SELECT photoUrl FROM Candidates WHERE photoUrl IS NOT NULL`);
    const activePhotos = new Set(rows.map((r) => r.photoUrl));
    if (fs.existsSync(CANDIDATE_DIR)) {
      for (const file of fs.readdirSync(CANDIDATE_DIR)) {
        const fullPath = path.join(CANDIDATE_DIR, file);
        if (!fs.statSync(fullPath).isFile()) continue;
        const rel = `/uploads/candidates/${file}`;
        if (activePhotos.has(rel)) continue;
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs < cutoff) {
          await removeFromObjectStorage(rel.replace("/uploads/", ""));
          safeUnlink(fullPath);
        }
      }
    }
  } catch (err) {
    console.error("[retention] candidate cleanup failed:", err?.message || err);
  }
}

async function anonymiseAuditLogs(userId, username) {
  try {
    await q(
      `UPDATE AuditLog
       SET actorId = NULL,
           notes = CONCAT(IFNULL(notes, ''), ' | anonymised due to deletion'),
           actorRole = NULL
       WHERE actorId = ?`,
      [userId]
    );
    await recordAuditEvent({
      actorId: null,
      actorRole: "system",
      action: "audit.anonymise",
      entityType: "user",
      entityId: String(userId),
      before: { userId },
      after: { userId: null },
      notes: `Audit entries anonymised for ${username || `user#${userId}`}`,
    });
  } catch (err) {
    console.error("[retention] audit anonymise failed:", err?.message || err);
  }
}

async function hardDeleteUser(user, { reason = "retention" } = {}) {
  if (!user?.id) return;
  const userId = user.id;
  const username = user.username || `user#${userId}`;
  try {
    if (user.profilePhoto && user.profilePhoto.startsWith("/uploads/")) {
      const relative = user.profilePhoto.replace("/uploads/", "");
      const localPath = path.join(uploadRoot, relative);
      await removeFromObjectStorage(relative);
      safeUnlink(localPath);
    }
    const [verificationAttachments] = await q(
      `SELECT fileKey FROM VerificationAttachment WHERE requestId IN (
          SELECT id FROM VerificationRequest WHERE userId=?
        )`,
      [userId]
    );
    for (const row of verificationAttachments || []) {
      if (!row?.fileKey) continue;
      await removeFromObjectStorage(row.fileKey);
      const localPath = path.join(uploadRoot, row.fileKey);
      safeUnlink(localPath);
    }
  } catch (err) {
    console.warn("[retention] profile photo cleanup failed:", err?.message || err);
  }

  try {
    await q(`DELETE FROM ChatSession WHERE userId=?`, [userId]);
    await q(`DELETE FROM ChatSession WHERE assignedAdminId=?`, [userId]);
    await q(`DELETE FROM ChatMessage WHERE senderId=?`, [userId]);
    await q(`DELETE FROM ChatGuestToken WHERE sessionId NOT IN (SELECT id FROM ChatSession)`);
  } catch (err) {
    console.error("[retention] chat record cleanup failed:", err?.message || err);
  }

  try {
    const email = user.email || "";
    const phone = user.phone || "";
    const likeParams = [];
    const likeClauses = [];
    if (email) {
      likeClauses.push("bodyParams LIKE ? OR queryParams LIKE ?");
      likeParams.push(`%${email}%`, `%${email}%`);
    }
    if (phone) {
      likeClauses.push("bodyParams LIKE ? OR queryParams LIKE ?");
      likeParams.push(`%${phone}%`, `%${phone}%`);
    }
    const deleteByUserId = `DELETE FROM RequestLogs WHERE userId=?${likeClauses.length ? ` OR (${likeClauses.join(" OR ")})` : ""}`;
    await q(deleteByUserId, [userId, ...likeParams]);
  } catch (err) {
    console.error("[retention] request log cleanup failed:", err?.message || err);
  }

  try {
    await anonymiseAuditLogs(userId, username);
    await q(`DELETE FROM Users WHERE id=?`, [userId]);
    await recordAuditEvent({
      actorId: null,
      actorRole: "system",
      action: "user.purged",
      entityType: "user",
      entityId: String(userId),
      before: {
        username: user.username,
        email: user.email,
        role: user.role,
      },
      after: null,
      notes: `Account purged (${reason})`,
    });
  } catch (err) {
    console.error("[retention] user purge failed:", err?.message || err);
  }
}

async function purgeScheduledUsers() {
  try {
    const [rows] = await q(
      `SELECT id, username, email, phone, role, profilePhoto
       FROM Users
       WHERE purgeAt IS NOT NULL AND purgeAt <= UTC_TIMESTAMP()`
    );
    for (const row of rows) {
      await hardDeleteUser(row, { reason: "scheduled" });
    }
  } catch (err) {
    console.error("[retention] purge scheduled users failed:", err?.message || err);
  }
}

async function purgeDormantUsers() {
  try {
    const [rows] = await q(
      `SELECT id, username, email, phone, role, profilePhoto
       FROM Users
       WHERE deletedAt IS NULL
         AND role NOT IN ('admin','super-admin')
         AND COALESCE(lastLoginAt, createdAt) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)`
    );
    for (const row of rows) {
      await hardDeleteUser(row, { reason: "dormant" });
    }
  } catch (err) {
    console.error("[retention] purge dormant users failed:", err?.message || err);
  }
}

async function scheduleSweep() {
  await cleanupChatHistory();
  await cleanupOldUploads();
  await purgeScheduledUsers();
  await purgeDormantUsers();
}

function startDataGovernanceScheduler() {
  const initialDelay = 15 * 1000;
  setTimeout(() => {
    scheduleSweep();
    setInterval(scheduleSweep, 6 * 60 * 60 * 1000);
  }, initialDelay);
}

async function markAccountForDeletion({ userId, actorRole = "user", ip = null, graceDays = 30 }) {
  const [[user]] = await q(`SELECT id, username, role FROM Users WHERE id=?`, [userId]);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }
  const purgeDateSql = `DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)`;
  const token = crypto.randomBytes(32).toString("hex");
  await q(
    `UPDATE Users
     SET deletedAt = UTC_TIMESTAMP(),
         purgeAt = ${purgeDateSql},
         restoreToken = ?
     WHERE id=?`,
    [graceDays, token, userId]
  );
  await recordAuditEvent({
    actorId: userId,
    actorRole,
    action: "user.delete-requested",
    entityType: "user",
    entityId: String(userId),
    after: { purgeAt: graceDays },
    ip,
  });
  return { purgeAt: new Date(Date.now() + graceDays * DAY_MS), token };
}

async function restoreAccount({ username, dateOfBirth, password, compare }) {
  const [[user]] = await q(
    `SELECT id, username, dateOfBirth, password, deletedAt, purgeAt, restoreToken
     FROM Users
     WHERE username=?`,
    [username]
  );

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }
  if (!user.deletedAt) {
    throw new Error("NOT_PENDING_DELETE");
  }
  if (user.purgeAt && new Date(user.purgeAt).getTime() <= Date.now()) {
    throw new Error("ALREADY_PURGED");
  }
  const storedDob = user.dateOfBirth ? new Date(user.dateOfBirth) : null;
  const dobIso = storedDob && !Number.isNaN(storedDob.getTime()) ? storedDob.toISOString().slice(0, 10) : null;
  if (!dobIso || dobIso !== dateOfBirth) {
    throw new Error("DOB_MISMATCH");
  }
  const matcher = typeof compare === "function" ? compare : bcrypt.compare;
  const passwordOk = await matcher(password, user.password || "");
  if (!passwordOk) {
    throw new Error("AUTH_FAILED");
  }

  await q(
    `UPDATE Users
     SET deletedAt = NULL,
         purgeAt = NULL,
         restoreToken = NULL,
         eligibilityStatus = 'active'
     WHERE id=?`,
    [user.id]
  );
  await recordAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "user.restored",
    entityType: "user",
    entityId: String(user.id),
  });
  if (user && user.password) {
    delete user.password;
  }
  return user;
}

module.exports = {
  startDataGovernanceScheduler,
  markAccountForDeletion,
  restoreAccount,
  hardDeleteUser,
};
