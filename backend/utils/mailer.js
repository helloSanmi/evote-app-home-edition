const fetch = global.fetch;

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || "";
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || "E-Vote";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

function isConfigured() {
  return Boolean(BREVO_API_KEY && BREVO_FROM_EMAIL);
}

function normalizeRecipients(to) {
  if (!Array.isArray(to)) return [];
  return to
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        const email = entry.trim();
        return email ? { email } : null;
      }
      if (entry.email) {
        const email = String(entry.email).trim();
        if (!email) return null;
        const name = entry.name ? String(entry.name).trim() : undefined;
        return { email, name };
      }
      return null;
    })
    .filter((recipient) => recipient && recipient.email);
}

function buildPayload({ recipients, subject, html, text }) {
  const payload = {
    sender: { email: BREVO_FROM_EMAIL, name: BREVO_FROM_NAME },
    to: recipients,
    subject: subject || "",
  };
  if (html) payload.htmlContent = html;
  if (text) payload.textContent = text;
  if (!html && !text) {
    payload.textContent = "";
  }
  return payload;
}

async function sendEmail({ to, subject, html, text }) {
  const recipients = normalizeRecipients(to);
  if (!recipients.length) {
    return { skipped: "no_recipients" };
  }
  if (!isConfigured()) {
    console.warn("[mailer] BREVO_API_KEY or BREVO_FROM_EMAIL not configured. Email skipped.", { subject });
    return { skipped: "not_configured" };
  }

  const payload = buildPayload({ recipients, subject, html, text });

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        accept: "application/json",
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
  const results = [];
  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
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
