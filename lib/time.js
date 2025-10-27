export function resolveSessionTiming(session, now = Date.now()) {
  if (!session) return { phase: "closed", countdownMs: 0 };
  const start = new Date(session.startTime).getTime();
  const end = new Date(session.endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { phase: "closed", countdownMs: 0 };
  }
  if (now < start) return { phase: "upcoming", countdownMs: start - now };
  if (now >= start && now <= end) return { phase: "live", countdownMs: end - now };
  return { phase: "closed", countdownMs: now - end };
}

export function formatCountdown(countdownMs) {
  if (!countdownMs || countdownMs <= 0) return "0s";
  const totalSeconds = Math.max(0, Math.floor(countdownMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || parts.length < 2) parts.push(`${minutes}m`);
  if (parts.length < 2 && days === 0) parts.push(`${seconds}s`);
  return parts.slice(0, 3).join(" ");
}
