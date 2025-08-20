// frontend/components/CookieBanner.js
import { useEffect, useState } from "react";

export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("cookieConsent");
      if (!v) setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem("cookieConsent", "accepted");
    } catch {}
    setShow(false);
  };
  const decline = () => {
    try {
      localStorage.setItem("cookieConsent", "declined");
    } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] md:w-[720px]">
      <div className="bg-white/95 backdrop-blur shadow-lg rounded-xl border p-4">
        <div className="text-sm text-gray-700">
          We use cookies to improve performance, analyze usage, and enhance your experience. You can accept or decline.
        </div>
        <div className="mt-3 flex gap-2 justify-end">
          <button
            onClick={decline}
            className="px-3 py-2 text-sm rounded border hover:bg-gray-50"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
