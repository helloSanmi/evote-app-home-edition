import { useCallback, useMemo, useState } from "react";
import { PublicClientApplication } from "@azure/msal-browser";

let msalApp = null;
let msalReady = false;

const getMsalApp = async (config) => {
  if (typeof window === "undefined") return null;
  if (!config.auth.clientId || !config.auth.authority) return null;
  if (!msalApp) {
    msalApp = new PublicClientApplication(config);
  }
  if (!msalReady) {
    await msalApp.initialize();
    msalReady = true;
  }
  return msalApp;
};

export default function MicrosoftAuthButton({ onToken, disabled = false }) {
  const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID || "";
  const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID || "";
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const config = useMemo(() => ({
    auth: {
      clientId,
      authority: tenantId ? `https://login.microsoftonline.com/${tenantId}` : undefined,
      redirectUri: typeof window !== "undefined" ? window.location.origin : undefined,
    },
    cache: {
      cacheLocation: "sessionStorage",
    },
  }), [clientId, tenantId]);

  const handleClick = useCallback(async () => {
    if (disabled || busy) return;
    setError(null);
    setBusy(true);
    try {
      const app = await getMsalApp(config);
      if (!app) throw new Error("Microsoft sign-in is not available.");
      const response = await app.loginPopup({
        scopes: ["openid", "profile", "email"],
        prompt: "select_account",
        claims: JSON.stringify({
          id_token: {
            wids: { essential: true },
            groups: { essential: false },
          },
        }),
      });
      if (!response?.idToken) {
        throw new Error("Microsoft sign-in did not return a token.");
      }
      if (typeof onToken === "function") {
        await onToken(response.idToken);
      }
    } catch (err) {
      const message = err?.message || "Microsoft sign-in failed. Try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [config, disabled, busy, onToken]);

  if (!clientId || !tenantId) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className={`inline-flex w-full items-center justify-center gap-3 rounded-full border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${
          disabled || busy
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-slate-200 bg-white text-slate-700 shadow-sm hover:-translate-y-[1px] hover:shadow-lg"
        }`}
      >
        <MicrosoftLogo />
        <span>{busy ? "Opening Microsoft..." : "Continue with Microsoft"}</span>
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-[4px] border border-slate-200 bg-white">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 23 23">
        <path fill="#F25022" d="M0 0h11v11H0z" />
        <path fill="#00A4EF" d="M12 0h11v11H12z" />
        <path fill="#7FBA00" d="M0 12h11v11H0z" />
        <path fill="#FFB900" d="M12 12h11v11H12z" />
      </svg>
    </span>
  );
}
