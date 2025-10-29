const { q } = require("../db");
const emailService = require("../services/emailService");

async function handleScheduled(period) {
  await emailService.sendSessionLifecycleEmail("scheduled", period);
  await q(`UPDATE VotingPeriod SET notifyScheduledAt=UTC_TIMESTAMP() WHERE id=?`, [period.id]);
}

async function handleStarted(period) {
  await emailService.sendSessionLifecycleEmail("started", period);
  await q(`UPDATE VotingPeriod SET notifyStartedAt=UTC_TIMESTAMP() WHERE id=?`, [period.id]);
}

async function handleEnded(period) {
  await emailService.sendSessionLifecycleEmail("ended", period);
  await q(`UPDATE VotingPeriod SET notifyEndedAt=UTC_TIMESTAMP() WHERE id=?`, [period.id]);
}

async function handleResults(period) {
  await emailService.sendSessionLifecycleEmail("results", period);
  await q(`UPDATE VotingPeriod SET notifyResultsAt=UTC_TIMESTAMP() WHERE id=?`, [period.id]);
}

async function fetchPeriods(query, params = []) {
  const [rows] = await q(query, params);
  return rows || [];
}

async function processNotificationQueue() {
  try {
    // Newly scheduled (legacy sessions without notification)
    const scheduled = await fetchPeriods(`
      SELECT * FROM VotingPeriod
       WHERE notifyScheduledAt IS NULL
         AND startTime > UTC_TIMESTAMP()
    `);
    for (const period of scheduled) {
      // eslint-disable-next-line no-await-in-loop
      await handleScheduled(period);
    }

    const started = await fetchPeriods(`
      SELECT * FROM VotingPeriod
       WHERE notifyStartedAt IS NULL
         AND startTime <= UTC_TIMESTAMP()
         AND (notifyScheduledAt IS NOT NULL OR createdAt <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))
         AND (forcedEnded = 0)
    `);
    for (const period of started) {
      // eslint-disable-next-line no-await-in-loop
      await handleStarted(period);
    }

    const ended = await fetchPeriods(`
      SELECT * FROM VotingPeriod
       WHERE notifyEndedAt IS NULL
         AND (forcedEnded = 1 OR endTime <= UTC_TIMESTAMP())
    `);
    for (const period of ended) {
      // eslint-disable-next-line no-await-in-loop
      await handleEnded(period);
    }

    const results = await fetchPeriods(`
      SELECT * FROM VotingPeriod
       WHERE notifyResultsAt IS NULL
         AND resultsPublished = 1
    `);
    for (const period of results) {
      // eslint-disable-next-line no-await-in-loop
      await handleResults(period);
    }

    await emailService.cleanupExpiredTokens();
  } catch (err) {
    console.error("notificationScheduler error", err);
  }
}

function startNotificationScheduler() {
  setTimeout(() => processNotificationQueue().catch(() => {}), 5000);
  setInterval(() => {
    processNotificationQueue().catch((err) => {
      console.error("notificationScheduler interval error", err);
    });
  }, 60 * 1000);
}

module.exports = { startNotificationScheduler };
