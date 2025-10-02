const test = require("node:test");
const assert = require("node:assert/strict");
const { checkEligibility, calcAgeOn } = require("../utils/eligibility");

const stubPool = (rows = []) => ({
  async query() {
    return [rows];
  },
});

test("calcAgeOn computes full years", () => {
  const age = calcAgeOn("2000-05-15", "2025-05-16T00:00:00Z");
  assert.equal(age, 25);
  assert.equal(calcAgeOn("2000-12-31", "2025-01-01"), 24);
  assert.equal(calcAgeOn(null, "2025-01-01"), null);
});

test("rejects users below minimum age", async () => {
  const pool = stubPool();
  const result = await checkEligibility(pool, { dateOfBirth: "2010-01-01" }, {
    minAge: 18,
    startTime: "2025-01-01",
    scope: "national",
    requireWhitelist: 0,
  });
  assert.deepEqual(result, { eligible: false, reason: "Minimum age 18" });
});

test("enforces local scope by state and LGA", async () => {
  const pool = stubPool();
  const result = await checkEligibility(pool, {
    dateOfBirth: "1990-01-01",
    state: "Lagos",
    residenceLGA: "Ikeja",
  }, {
    minAge: 18,
    startTime: "2025-01-01",
    scope: "local",
    scopeState: "Oyo",
    scopeLGA: "Ibadan",
    requireWhitelist: 0,
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "Restricted to Oyo");
});

test("requires whitelist entry when flagged", async () => {
  const poolMiss = stubPool([]);
  const poolHit = stubPool([{ id: 1 }]);
  const period = {
    minAge: 18,
    startTime: "2025-01-01",
    scope: "national",
    requireWhitelist: 1,
  };
  const user = { email: "person@example.com", nationalId: "ABC123", dateOfBirth: "1990-01-01" };

  const denied = await checkEligibility(poolMiss, user, period);
  assert.deepEqual(denied, { eligible: false, reason: "Not on whitelist" });

  const allowed = await checkEligibility(poolHit, user, period);
  assert.deepEqual(allowed, { eligible: true });
});
