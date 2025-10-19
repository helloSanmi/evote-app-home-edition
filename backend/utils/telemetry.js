const os = require("os");
const { q } = require("../db");

const startedAt = Date.now();

async function buildMetricsSnapshot() {
  const [[requestStats]] = await q(`
    SELECT
      COUNT(*) AS total,
      AVG(durationMs) AS avgDuration,
      SUM(CASE WHEN statusCode >= 500 THEN 1 ELSE 0 END) AS serverErrors,
      SUM(CASE WHEN statusCode BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS clientErrors
    FROM RequestLogs
    WHERE createdAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`);

  const [[authEvents]] = await q(`
    SELECT COUNT(*) AS count
    FROM RequestLogs
    WHERE path LIKE '/api/auth/%' AND createdAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`);

  const [[webhookEvents]] = await q(`
    SELECT COUNT(*) AS count
    FROM RequestLogs
    WHERE path LIKE '%/webhook%' AND createdAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`);

  const [[thirdParty]] = await q(`
    SELECT
      SUM(CASE WHEN path LIKE '%google%' THEN 1 ELSE 0 END) AS googleCalls
    FROM RequestLogs
    WHERE createdAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`);

  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      systemFree: os.freemem(),
    },
    requests: {
      last24h: Number(requestStats?.total || 0),
      avgLatencyMs: Number(requestStats?.avgDuration || 0),
      serverErrors: Number(requestStats?.serverErrors || 0),
      clientErrors: Number(requestStats?.clientErrors || 0),
    },
    authEvents: Number(authEvents?.count || 0),
    webhooks: Number(webhookEvents?.count || 0),
    integrations: {
      googleAuthCalls24h: Number(thirdParty?.googleCalls || 0),
      googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
    },
  };
}

module.exports = { buildMetricsSnapshot };
