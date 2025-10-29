const fetch = global.fetch;

const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY || "";
const MAILERSEND_FROM_EMAIL = process.env.MAILERSEND_FROM_EMAIL || "";
const MAILERSEND_FROM_NAME = process.env.MAILERSEND_FROM_NAME || "E-Vote";
const MAILERSEND_ENDPOINT = "https://api.mailersend.com/v1/email";

function isConfigured() {
  return Boolean(MAILERSEND_API_KEY && MAILERSEND_FROM_EMAIL);
}

function normalizeRecipients(to) {
  if (!Array.isArray(to)) return [];
  return to
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        return { email: entry.trim() };
      }
      if (entry.email) {
        return {
          email: String(entry.email).trim(),
          name: entry.name ? String(entry.name).trim() : undefined,
        };
      }
      return null;
    })
    .filter((recipient) => recipient && recipient.email);
}

async function sendEmail({ to, subject, html, text }) {
  const recipients = normalizeRecipients(to);
  if (!recipients.length) {
    return { skipped: "no_recipients" };
  }
  if (!isConfigured()) {
    console.warn("[mailer] MAILERSEND_API_KEY or MAILERSEND_FROM_EMAIL not configured. Email skipped.", { subject });
    return { skipped: "not_configured" };
  }
  const payload = {
    from: { email: MAILERSEND_FROM_EMAIL, name: MAILERSEND_FROM_NAME },
    to: recipients,
    subject,
    html: html || undefined,
    text: text || undefined,
  };

  try {
    const res = await fetch(MAILERSEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MAILERSEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error("[mailer] Failed to send email", res.status, errorText || res.statusText);
      return { error: res.statusText, status: res.status };
    }
    return { success: true };
  } catch (err) {
    console.error("[mailer] Error sending email", err);
    return { error: err?.message || "MAILER_ERROR" };
  }
}

async function sendBulkEmail({ recipients, subject, html, text, chunkSize = 50 }) {
  const normalized = normalizeRecipients(recipients);
  if (!normalized.length) return { skipped: "no_recipients" };
  const chunks = [];
  for (let i = 0; i < normalized.length; i += chunkSize) {
    chunks.push(normalized.slice(i, i + chunkSize));
  }
  const results = [];
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendEmail({ to: chunk, subject, html, text });
    results.push(result);
  }
  return results;
}

module.exports = {
  sendEmail,
  sendBulkEmail,
  isConfigured,
};
