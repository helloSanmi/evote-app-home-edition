export function clearSessionStorage() {
  try {
    const keys = [
      "token",
      "userId",
      "username",
      "fullName",
      "firstName",
      "lastName",
      "profilePhoto",
      "role",
      "isAdmin",
      "state",
      "residenceLGA",
      "email",
      "emailVerified",
      "needsEmailVerification",
      "needsProfileCompletion",
      "needsPasswordReset",
      "eligibilityStatus",
      "verificationStatus",
      "chatGuestName",
      "chatGuestToken",
    ];
    keys.forEach((key) => localStorage.removeItem(key));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

export function forceLogout({ redirectTo = "/login", notify } = {}) {
  if (typeof window === "undefined") return;
  clearSessionStorage();
  if (typeof notify === "function") {
    try {
      notify();
    } catch {}
  }
  window.location.replace(redirectTo);
}
