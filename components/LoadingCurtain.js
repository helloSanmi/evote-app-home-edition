/**
 * Full screen overlay used for route transitions and async flows.
 */
export default function LoadingCurtain({ active, message = "Loading…", subText = "", variant = "default" }) {
  if (!active) return null;

  const containerTone = variant === "subtle" ? "bg-white/70 backdrop-blur" : "bg-slate-900/60 backdrop-blur-sm";

  return (
    <div className={`fixed inset-0 z-[190] flex items-center justify-center px-6 ${containerTone}`} role="status" aria-live="polite">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-white/60 bg-white/95 px-8 py-7 text-center shadow-2xl">
        <span className="h-12 w-12 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-base font-semibold text-slate-800">{message}</p>
          {subText ? <p className="text-sm text-slate-500">{subText}</p> : null}
        </div>
      </div>
    </div>
  );
}
