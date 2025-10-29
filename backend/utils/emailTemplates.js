const APP_BASE_URL = process.env.APP_PUBLIC_URL?.replace(/\/$/, "") || "http://localhost:3000";
const LOGO_URL = `${APP_BASE_URL}/logo.png`;

function formatDateTime(value, timeZone = "Africa/Lagos") {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

function buildLayout({ title, lead, body, button, footerNote }) {
  const buttonHtml = button
    ? `<table role="presentation" style="margin-top:24px"><tr><td>
        <a href="${button.href}" style="display:inline-flex;align-items:center;justify-content:center;padding:12px 24px;border-radius:999px;background:#312e81;color:#fff;font-weight:600;text-decoration:none;">${button.label}</a>
       </td></tr></table>`
    : "";

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" style="padding:32px 0;background:#f1f5f9;">
      <tr>
        <td>
          <table role="presentation" width="640" align="center" style="margin:0 auto;background:#ffffff;border-radius:24px;box-shadow:0 24px 64px -40px rgba(37,99,235,0.35);padding:40px 48px;">
            <tr>
              <td style="text-align:center;padding-bottom:32px;">
                <img src="${LOGO_URL}" alt="EVote Tech Analytics" width="64" height="64" style="border-radius:16px;border:1px solid rgba(148,163,184,0.25);" />
              </td>
            </tr>
            <tr>
              <td>
                <h1 style="margin:0;font-size:26px;line-height:1.3;font-weight:700;color:#0f172a;text-align:center;">${title}</h1>
                ${lead ? `<p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#475569;text-align:center;">${lead}</p>` : ""}
                <div style="margin-top:28px;font-size:15px;line-height:1.7;color:#1e293b;">${body}</div>
                ${buttonHtml}
              </td>
            </tr>
            <tr>
              <td style="padding-top:32px;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
                ${footerNote || "You are receiving this email because you use the EVote Tech Analytics platform."}
                <br/>EVote Tech Analytics · notifications@techanalytics.org
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

function activationTemplate({ name, token }) {
  const url = `${APP_BASE_URL}/activate?token=${encodeURIComponent(token)}`;
  const subject = "Activate your EVote account";
  const lead = `Hi ${name || "there"}, welcome to EVote!`;
  const body = `
    <p>Before you can sign in, please confirm your email address. This helps us keep your account secure and ensure only verified voters participate.</p>
    <p style="margin-top:18px;">Click the button below to activate your account. This link will expire in 24 hours.</p>
  `;
  const html = buildLayout({ title: "Confirm your email", lead, body, button: { href: url, label: "Activate account" } });
  const text = `Hi ${name || "there"},\n\nConfirm your email to finish setting up EVote. Activate your account: ${url}\n\nIf you didn’t sign up, you can ignore this email.`;
  return { subject, html, text };
}

function welcomeTemplate({ name }) {
  const subject = "Welcome to EVote Tech Analytics";
  const lead = `Thanks for activating your account, ${name || "friend"}!`;
  const body = `
    <p>Your voting dashboard is ready. From upcoming ballots to real-time results, everything is designed to keep you informed.</p>
    <ul style="padding-left:20px;margin:18px 0;">
      <li>See every election you’re eligible for</li>
      <li>Receive timely reminders before voting opens</li>
      <li>Track turnout and published results with ease</li>
    </ul>
    <p>We’re excited to have you on board.</p>
  `;
  const html = buildLayout({ title: "You’re all set!", lead, body, button: { href: `${APP_BASE_URL}/login`, label: "Go to login" } });
  const text = `Welcome to EVote! Head to your dashboard to explore upcoming elections: ${APP_BASE_URL}/login`;
  return { subject, html, text };
}

function passwordResetTemplate({ name, token }) {
  const url = `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your EVote password";
  const lead = `Hi ${name || "there"}, let’s help you get back in.`;
  const body = `
    <p>We received a request to reset your password. Use the link below to choose a new one. If you didn’t ask for this, simply ignore the email.</p>
    <p style="margin-top:18px;">For your security, the link expires in 60 minutes.</p>
  `;
  const html = buildLayout({ title: "Reset your password", lead, body, button: { href: url, label: "Create new password" } });
  const text = `Reset your EVote password using this link (valid for 60 minutes): ${url}`;
  return { subject, html, text };
}

function sessionTemplate({ type, period, url }) {
  const { title, startTime, endTime, scope, scopeState, scopeLGA } = period;
  const readableTitle = title || `Session #${period.id}`;
  const scopeDetails = [scope?.toUpperCase?.() || "NATIONAL", scopeState, scope === "local" ? scopeLGA : null]
    .filter(Boolean)
    .join(" • ");
  let button = { href: url || `${APP_BASE_URL}/vote`, label: "Open voting hub" };
  const forced = Boolean(period?.forcedEnded);

  let subject = "";
  let lead = "";
  let body = "";
  switch (type) {
    case "scheduled":
      subject = `${readableTitle} has been scheduled`;
      lead = "A new election is on the way.";
      body = `
        <p><strong>${readableTitle}</strong> is scheduled and will open soon.</p>
        <p style="margin-top:12px;">Starts: <strong>${formatDateTime(startTime)}</strong><br/>Ends: <strong>${formatDateTime(endTime)}</strong><br/>Scope: <strong>${scopeDetails}</strong></p>
        <p style="margin-top:18px;">We’ll remind you again when voting begins.</p>
      `;
      break;
    case "started":
      subject = `${readableTitle} is now live`;
      lead = "Voting is open.";
      body = `
        <p><strong>${readableTitle}</strong> is accepting ballots.</p>
        <p style="margin-top:12px;">Cast your vote before <strong>${formatDateTime(endTime)}</strong>.</p>
      `;
      break;
    case "ended":
      if (forced) {
        subject = `${readableTitle} ended early`;
        lead = "Voting closed ahead of schedule.";
        body = `
          <p>Administrators ended <strong>${readableTitle}</strong> earlier than planned.</p>
          <p style="margin-top:12px;">Original end time: <strong>${formatDateTime(endTime)}</strong>.</p>
          <p style="margin-top:18px;">We appreciate your participation. Watch your dashboard for any follow-up announcements.</p>
        `;
      } else {
        subject = `${readableTitle} has closed`;
        lead = "Voting has ended.";
        body = `
          <p>The ballot for <strong>${readableTitle}</strong> is now closed.</p>
          <p>Thank you for participating. We’ll notify you the moment results are published.</p>
        `;
      }
      break;
    case "results":
      subject = `${readableTitle} results are in`;
      lead = "The final tally is ready.";
      body = `
        <p>Results for <strong>${readableTitle}</strong> have been published.</p>
        <p>Visit your dashboard to review the breakdown and archived insights.</p>
      `;
      button = { href: url || `${APP_BASE_URL}/results`, label: "View results" };
      break;
    case "cancelled":
      subject = `${readableTitle} has been cancelled`;
      lead = "This election will not proceed.";
      body = `
        <p><strong>${readableTitle}</strong> was cancelled before it began.</p>
        <p style="margin-top:12px;">Originally scheduled for <strong>${formatDateTime(startTime)}</strong>.</p>
        <p style="margin-top:18px;">We will keep you informed about any replacement session or new schedule.</p>
      `;
      button = { href: url || `${APP_BASE_URL}/vote`, label: "See updates" };
      break;
    default:
      subject = `${readableTitle} update`;
      lead = "There’s news about your election.";
      body = `<p>Visit your dashboard for the latest update.</p>`;
  }

  const html = buildLayout({ title: readableTitle, lead, body, button });
  const text = `${readableTitle} • ${scopeDetails}\nStarts: ${formatDateTime(startTime)}\nEnds: ${formatDateTime(endTime)}\n\nSee more: ${button.href}`;
  return { subject, html, text };
}

module.exports = {
  activationTemplate,
  welcomeTemplate,
  passwordResetTemplate,
  sessionTemplate,
  formatDateTime,
  APP_BASE_URL,
};
