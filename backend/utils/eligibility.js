// backend/utils/eligibility.js
const dayjs = require("dayjs");

function calcAgeOn(dateOfBirth, atDate) {
  if (!dateOfBirth) return null;
  const dob = dayjs(dateOfBirth);
  const at = dayjs(atDate);
  if (!dob.isValid() || !at.isValid()) return null;
  let age = at.year() - dob.year();
  if (at.month() < dob.month() || (at.month() === dob.month() && at.date() < dob.date())) age--;
  return age;
}

async function whitelistOK(pool, user, period) {
  if (!period.requireWhitelist) return true;
  const [rows] = await pool.query(
    "SELECT id FROM EligibleVoters WHERE (email IS NOT NULL AND email=?) OR (voterId IS NOT NULL AND voterId=?) LIMIT 1",
    [user.email || null, user.nationalId || null]
  );
  return rows.length > 0;
}

async function checkEligibility(pool, user, period) {
  if (!period) return { eligible: false, reason: "No active period" };

  // Min age
  if (period.minAge && Number(period.minAge) > 0) {
    const age = calcAgeOn(user.dateOfBirth, period.startTime);
    if (age === null) return { eligible: false, reason: "Missing date of birth" };
    if (age < Number(period.minAge)) return { eligible: false, reason: `Minimum age ${period.minAge}` };
  }

  // Scope by LGA
  if (period.scopeLGA && String(period.scopeLGA).trim()) {
    if (!user.residenceLGA) return { eligible: false, reason: "Residence LGA not set" };
    if (String(user.residenceLGA).trim().toLowerCase() !== String(period.scopeLGA).trim().toLowerCase()) {
      return { eligible: false, reason: `Restricted to ${period.scopeLGA}` };
    }
  }

  // Whitelist
  if (period.requireWhitelist) {
    const ok = await whitelistOK(pool, user, period);
    if (!ok) return { eligible: false, reason: "Not on whitelist" };
  }

  return { eligible: true };
}

module.exports = { checkEligibility };
