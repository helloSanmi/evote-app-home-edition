import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { apiPost } from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";

export default function ActivateAccount() {
  const router = useRouter();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Confirming your account…");
  const token = Array.isArray(router.query.token) ? router.query.token[0] : router.query.token;

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await apiPost("/api/auth/activate", { token });
        if (res?.already) {
          setStatus("success");
          setMessage("Your account is already activated. You can sign in right away.");
          if (typeof window !== "undefined") {
            localStorage.setItem("emailVerified", "true");
            localStorage.removeItem("needsEmailVerification");
            window.dispatchEvent(new Event("storage"));
          }
        } else {
          setStatus("success");
          setMessage("Your email is confirmed. You're ready to sign in and start voting.");
          notifySuccess("Activation complete");
          if (typeof window !== "undefined") {
            localStorage.setItem("emailVerified", "true");
            localStorage.removeItem("needsEmailVerification");
            window.dispatchEvent(new Event("storage"));
          }
        }
      } catch (err) {
        setStatus("error");
        setMessage(err.message || "We couldn't activate your account. Request a new link and try again.");
        notifyError(err.message || "Activation failed");
      }
    })();
  }, [token]);

  const loading = status === "loading";

  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-4xl items-center">
      <div className="card w-full text-center">
        <h1 className="text-3xl font-semibold text-slate-900">Activate your account</h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
        {loading && (
          <div className="mt-6 text-sm text-slate-500">Please wait…</div>
        )}
        {!loading && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login" className="btn-primary">
              Go to login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
