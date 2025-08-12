// frontend/pages/_app.js
import "../styles/globals.css";
import Layout from "../components/Layout";
import { ToastContainer } from "react-toastify";
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
      <ToastContainer />
      <style jsx global>{`
        .page-anim {
          animation: fadeScale 240ms ease-out;
        }
        @keyframes fadeScale {
          0% { opacity: 0; transform: translateY(8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </Layout>
  );
}
