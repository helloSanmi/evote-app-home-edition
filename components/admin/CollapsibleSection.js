import { useState } from "react";

export default function CollapsibleSection({ title, description, action, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_45px_-40px_rgba(15,23,42,0.38)] backdrop-blur-sm md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {action}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </header>
      {open && <div className="mt-5">{children}</div>}
    </section>
  );
}
