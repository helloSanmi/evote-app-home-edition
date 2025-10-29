const crypto = require("node:crypto");
const { q } = require("../db");
const mailer = require("../utils/mailer");
const templates = require("../utils/emailTemplates");

const APP_BASE_URL = templates.APP_BASE_URL;

function toName(user) {
  return user?.fullName || user?.firstName || user?.username || "there";
}

async function sendActivationEmail(user, token) {
  if (!user?.email) return { skipped: "no_email" };
  const payload = templates.activationTemplate({ name: toName(user), token });
  return mailer.sendEmail({ to: [{ email: user.email, name: user.fullName || user.username }], ...payload });
}

async function sendWelcomeEmail(user) {
  if (!user?.email) return { skipped: "no_email" };
  const payload = templates.welcomeTemplate({ name: toName(user) });
  return mailer.sendEmail({ to: [{ email: user.email, name: user.fullName || user.username }], ...payload });
}

async function sendPasswordResetEmail(user, token) {
  if (!user?.email) return { skipped: "no_email" };
  const payload = templates.passwordResetTemplate({ name: toName(user), token });
  return mailer.sendEmail({ to: [{ email: user.email, name: user.fullName || user.username }], ...payload });
}

async function selectRecipientsForPeriod(period) {
  const scope = (period.scope || "national").toLowerCase();
  const params = [];
  let where = "eligibilityStatus='active' AND email IS NOT NULL AND email <> '' AND emailVerifiedAt IS NOT NULL";
  if (scope === "state") {
    where += " AND LOWER(state)=?";
    params.push(String(period.scopeState || "").trim().toLowerCase());
  }
  if (scope === "local") {
    where += " AND LOWER(state)=? AND LOWER(residenceLGA)=?";
    params.push(String(period.scopeState || "").trim().toLowerCase());
    params.push(String(period.scopeLGA || "").trim().toLowerCase());
  }
  const [rows] = await q(
    `SELECT id, email, fullName, username
       FROM Users
      WHERE ${where}`,
    params
  );
  return rows || [];
}

async function sendSessionLifecycleEmail(type, period) {
  if (!period) return { skipped: "no_period" };
  const recipients = await selectRecipientsForPeriod(period);
  if (!recipients.length) return { skipped: "no_recipients" };
  const payload = templates.sessionTemplate({ type, period, url: `${APP_BASE_URL}/vote` });
  const mapped = recipients.map((row) => ({ email: row.email, name: row.fullName || row.username }));
  return mailer.sendBulkEmail({ recipients: mapped, ...payload });
}

async function generateActivationToken(userId, expiresInHours = 24) {
  const token = crypto.randomUUID();
  const expiry = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  await q(`UPDATE Users SET activationToken=?, activationExpires=? WHERE id=?`, [token, expiry, userId]);
  return { token, expiry };
}

async function createPasswordResetToken(userId, expiresInMinutes = 60) {
  const token = crypto.randomUUID();
  const expiry = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  await q(`INSERT INTO UserPasswordReset (userId, token, expiresAt) VALUES (?,?,?)`, [userId, token, expiry]);
  return { token, expiry };
}

async function markPasswordResetUsed(token) {
  await q(`UPDATE UserPasswordReset SET usedAt=UTC_TIMESTAMP() WHERE token=?`, [token]);
}

async function cleanupExpiredTokens() {
  await q(`DELETE FROM UserPasswordReset WHERE (usedAt IS NOT NULL AND usedAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY))
            OR expiresAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`);
}

module.exports = {
  sendActivationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendSessionLifecycleEmail,
  generateActivationToken,
  createPasswordResetToken,
  markPasswordResetUsed,
  cleanupExpiredTokens,
};
