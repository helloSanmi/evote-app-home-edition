// backend/utils/eligibility.js

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcAgeOn(dateOfBirth, atDate) {
  const dob = toDate(dateOfBirth);
  const at = toDate(atDate || new Date());
  if (!dob || !at) return null;
  let age = at.getFullYear() - dob.getFullYear();
  const monthDiff = at.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < dob.getDate())) age--;
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

  const scope = (period.scope || "national").toLowerCase();
  if (scope === "state") {
    if (!user.state || !period.scopeState) return { eligible: false, reason: "State restriction" };
    if (String(user.state).trim().toLowerCase() !== String(period.scopeState).trim().toLowerCase()) {
      return { eligible: false, reason: `Restricted to ${period.scopeState}` };
    }
  }
  if (scope === "local") {
    if (!user.state || !period.scopeState) return { eligible: false, reason: "State restriction" };
    const matchesState = String(user.state).trim().toLowerCase() === String(period.scopeState).trim().toLowerCase();
    if (!matchesState) return { eligible: false, reason: `Restricted to ${period.scopeState}` };
    if (!user.residenceLGA || !period.scopeLGA) return { eligible: false, reason: "LGA restriction" };
    if (String(user.residenceLGA).trim().toLowerCase() !== String(period.scopeLGA).trim().toLowerCase()) {
      return { eligible: false, reason: `Restricted to ${period.scopeLGA}` };
    }
  } else if (period.scopeLGA && String(period.scopeLGA).trim()) {
    // Backward compatibility: if LGA is set but scope omitted, still enforce LGA
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

module.exports = { checkEligibility, calcAgeOn };


