import { useEffect, useRef, useState } from "react";

const SCRIPT_ID = "google-identity-services";

function loadScript(onLoad) {
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    if (typeof onLoad === "function") {
      if (existing.getAttribute("data-loaded") === "true") {
        onLoad();
      } else {
        existing.addEventListener("load", onLoad, { once: true });
      }
    }
    return;
  }
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  if (typeof onLoad === "function") {
    script.addEventListener("load", () => {
      script.setAttribute("data-loaded", "true");
      onLoad();
    }, { once: true });
  } else {
    script.addEventListener("load", () => script.setAttribute("data-loaded", "true"), { once: true });
  }
  document.body.appendChild(script);
}

export default function GoogleAuthButton({ onCredential, text = "Continue with Google", disabled = false }) {
  const buttonRef = useRef(null);
  const [error, setError] = useState(null);
  const [rendered, setRendered] = useState(false);
  const [nativeButton, setNativeButton] = useState(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return;
    const handleCredential = (response) => {
      if (!response?.credential) {
        setError("Google sign-in failed. Try again.");
        return;
      }
      setError(null);
      if (typeof onCredential === "function") {
        onCredential(response.credential);
      }
    };

    const initialize = () => {
      if (!window.google?.accounts?.id || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        cancel_on_tap_outside: true,
      });
      buttonRef.current.innerHTML = "";
      setNativeButton(null);
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        width: buttonRef.current.offsetWidth || 260,
      });
      const native = buttonRef.current.querySelector("div[role=button]");
      if (native) {
        Object.assign(native.style, {
          position: "absolute",
          inset: "0",
          opacity: "0",
          pointerEvents: "none",
        });
        setNativeButton(native);
      }
      setRendered(true);
    };

    loadScript(initialize);
  }, [clientId, onCredential]);

  if (!clientId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
        Google sign-in is not configured.
      </div>
    );
  }

  const ready = Boolean(nativeButton);

  const triggerSignIn = () => {
    if (disabled) return;
    if (nativeButton) {
      setError(null);
      nativeButton.click();
    } else if (window.google?.accounts?.id) {
      setError(null);
      window.google.accounts.id.prompt();
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative h-0 overflow-hidden" aria-hidden="true">
        <div ref={buttonRef} />
      </div>
      <button
        type="button"
        onClick={triggerSignIn}
        disabled={disabled || !ready}
        className={`inline-flex w-full items-center justify-center gap-3 rounded-full border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${
          disabled || !ready
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-slate-200 bg-white text-slate-700 shadow-sm hover:-translate-y-[1px] hover:shadow-lg"
        }`}
      >
        <GoogleLogo />
        <span>{text}</span>
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {!rendered && !error && !ready && (
        <p className="text-xs text-slate-500">Preparing Google sign-in…</p>
      )}
    </div>
  );
}

function GoogleLogo() {
  return (
    <span className="flex h-5 w-5 items-center justify-center">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
        <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.19-2.02H10v3.82h5.45a4.65 4.65 0 0 1-1.99 3.05v2.53h3.22c1.89-1.74 2.97-4.31 2.97-7.38z" />
        <path fill="#34A853" d="M10 20c2.7 0 4.96-.9 6.62-2.43l-3.22-2.53c-.9.6-2.06.94-3.4.94-2.62 0-4.84-1.77-5.63-4.16H1.05v2.62C2.69 17.98 6.1 20 10 20z" />
        <path fill="#FBBC05" d="M4.37 11.82a5.99 5.99 0 0 1 0-3.64V5.56H1.05a10 10 0 0 0 0 8.88l3.32-2.62z" />
        <path fill="#EA4335" d="M10 3.96c1.47 0 2.8.5 3.85 1.48l2.88-2.88C14.96.99 12.7 0 10 0 6.1 0 2.69 2.02 1.05 5.56l3.32 2.62C5.16 5.73 7.38 3.96 10 3.96z" />
      </svg>
    </span>
  );
}
