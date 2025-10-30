// frontend/components/ConfirmDialog.js
export default function ConfirmDialog({ open, title = "Confirm action", message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, tone = "indigo", children }) {
  if (!open) return null;

  const confirmClasses = tone === "danger"
    ? "bg-rose-500 text-white hover:bg-rose-400 focus-visible:ring-rose-200/70"
    : "bg-indigo-200 text-indigo-900 hover:bg-indigo-300 focus-visible:ring-indigo-200/70";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/40 bg-white/95 p-5 shadow-xl sm:p-6">
        <div className="space-y-3 text-center">
          <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary px-5"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
