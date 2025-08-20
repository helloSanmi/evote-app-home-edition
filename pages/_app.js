// frontend/pages/_app.js
import "../styles/globals.css";
import Layout from "../components/Layout";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const [routeKey, setRouteKey] = useState(router.asPath);

  useEffect(() => {
    const handleStart = () => setRouteKey(Math.random().toString(36));
    router.events.on("routeChangeStart", handleStart);
    return () => router.events.off("routeChangeStart", handleStart);
  }, [router.events]);

  return (
    <Layout>
      <div key={routeKey} className="page-anim">
        <Component {...pageProps} />
      </div>

      <ToastContainer newestOnTop />

      <style jsx global>{`
        .page-anim { animation: fadeScale 220ms ease-out; }
        @keyframes fadeScale {
          0% { opacity: 0; transform: translateY(8px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Toastify tweak: larger centered cards */
        .Toastify__toast-container { z-index: 9999; }
        .Toastify__toast { border-radius: 14px; }
        .Toastify__toast--success { background: #16a34a; }
        .Toastify__toast--error { background: #dc2626; }
        .Toastify__toast--info { background: #2563eb; }
      `}</style>
    </Layout>
  );
}
