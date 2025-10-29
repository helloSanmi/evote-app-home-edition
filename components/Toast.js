// frontend/components/Toast.js
import { toast } from "react-toastify";

const base = {
  position: "top-center",
  autoClose: 2600,
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
  theme: "dark",
  icon: false,
  className: "shadow-xl rounded-2xl !px-0 !py-0 !bg-transparent",
  bodyClassName: "!p-0",
};

const ToastShell = ({ tone = "emerald", title, message }) => {
  const tones = {
    emerald: {
      ring: "ring-emerald-400/40",
      bg: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700",
      icon: "M5 13l4 4L19 7" // check
    },
    rose: {
      ring: "ring-rose-400/40",
      bg: "bg-gradient-to-br from-rose-500 via-rose-600 to-rose-700",
      icon: "M6 18L18 6M6 6l12 12" // x
    },
    indigo: {
      ring: "ring-indigo-400/40",
      bg: "bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700",
      icon: "M12 8v4m0 4h.01" // info
    },
  };
  const palette = tones[tone] || tones.emerald;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 text-white shadow-2xl ring-2 ${palette.ring}`}>
      <div className={`${palette.bg} flex items-start gap-4 px-5 py-4 backdrop-blur`}> 
        <div className="mt-1 rounded-xl bg-white/15 p-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={palette.icon} />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold tracking-wide uppercase text-white/90">{title}</p>
          <p className="mt-1 text-sm text-white/85">{message}</p>
        </div>
      </div>
    </div>
  );
};

export function notifySuccess(msg) {
  toast(<ToastShell tone="emerald" title="Done" message={msg} />, base);
}

export function notifyError(msg) {
  toast(<ToastShell tone="rose" title="Heads up" message={msg} />, base);
}

export function notifyInfo(msg) {
  toast(<ToastShell tone="indigo" title="Notice" message={msg} />, base);
}
