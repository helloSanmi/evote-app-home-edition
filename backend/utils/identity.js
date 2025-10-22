const NAME_PART_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ.'-]{2,60}$/;
const FULL_NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ.' -]{3,120}$/;
const PHONE_PATTERN = /^[0-9+()\s-]{7,20}$/;
const NATIONAL_ID_PATTERN = /^[0-9]{11}$/;
const PVC_PATTERN = /^[A-Z0-9]{8,20}$/;
const ALLOWED_GENDERS = new Set(["male", "female", "non-binary", "prefer-not-to-say"]);
const REQUIRED_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "gender",
  "nationalId",
  "voterCardNumber",
  "residenceAddress",
  "state",
  "residenceLGA",
  "phone",
];

function sanitizeSpacing(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeLocale(value) {
  if (!value) return null;
  return String(value).trim().replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s.'-]/g, "") || null;
}

function normalizePhone(value) {
  if (!value) return null;
  const trimmed = String(value).trim().replace(/[^0-9+()\s-]/g, "");
  return trimmed || null;
}

function normalizeAddress(value) {
  if (!value) return null;
  const cleaned = String(value).trim().replace(/[^A-Za-z0-9\s,.'/-]/g, "");
  return cleaned || null;
}

function validateDob(dob) {
  if (!dob) return { ok: false, message: "Date of birth is required." };
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return { ok: false, message: "Invalid date of birth." };
  const today = new Date();
  if (birthDate > today) return { ok: false, message: "Date of birth cannot be in the future." };
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  if (age < 18) return { ok: false, message: "You must be at least 18 years old to register." };
  return { ok: true, value: birthDate.toISOString().split("T")[0] };
}

function requiresProfileCompletion(user = {}) {
  const role = String(user.role || "").toLowerCase();
  if (role === "admin" || role === "super-admin") return false;
  return REQUIRED_PROFILE_FIELDS.some((field) => {
    const value = user[field];
    if (value === null || value === undefined) return true;
    if (typeof value === "string" && !value.trim()) return true;
    return false;
  });
}

function deriveNameParts(name) {
  const cleaned = sanitizeSpacing(name);
  if (!cleaned) return { first: "", last: "", full: "" };
  const parts = cleaned.split(" ");
  const first = parts.shift() || "";
  const last = parts.length ? parts.join(" ") : first;
  return { first, last, full: cleaned };
}

module.exports = {
  NAME_PART_PATTERN,
  FULL_NAME_PATTERN,
  PHONE_PATTERN,
  NATIONAL_ID_PATTERN,
  PVC_PATTERN,
  ALLOWED_GENDERS,
  REQUIRED_PROFILE_FIELDS,
  sanitizeSpacing,
  normalizeLocale,
  normalizePhone,
  normalizeAddress,
  validateDob,
  requiresProfileCompletion,
  deriveNameParts,
};
