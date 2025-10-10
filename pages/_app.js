// pages/_app.js
import "../styles/globals.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Head from "next/head";
import Layout from "../components/Layout";
import { notifyInfo, notifyError } from "../components/Toast";
import { apiPost } from "../lib/apiBase";
import { getSocket, reidentifySocket } from "../lib/socket";
import LoadingCurtain from "../components/LoadingCurtain";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState("Preparing your next view…");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const socket = getSocket();

    const handleRoleUpdated = async () => {
      try {
        const data = await apiPost("/api/auth/refresh-role", {});
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", (data.role || "user").toLowerCase());
        localStorage.setItem("isAdmin", data.isAdmin ? "true" : "false");
        localStorage.setItem("userId", data.userId);
        localStorage.setItem("username", data.username);
        if (data.profilePhoto) localStorage.setItem("profilePhoto", data.profilePhoto);
        window.dispatchEvent(new Event("storage"));
        reidentifySocket();
        const elevated = data.role === "admin" || data.role === "super-admin";
        notifyInfo(elevated ? "Admin access enabled." : "Admin access removed.");
        if (elevated) {
          if (router.pathname !== "/admin") router.replace("/admin");
        } else if (router.pathname.startsWith("/admin")) {
          router.replace("/");
        }
      } catch (err) {
        notifyError(err.message || "Failed to refresh permissions");
      }
    };

    socket.on("roleUpdated", handleRoleUpdated);
    return () => socket.off("roleUpdated", handleRoleUpdated);
  }, [router]);

  useEffect(() => {
    const handleStart = (url) => {
      const pretty = url.includes("/admin")
        ? "Opening the admin console…"
        : url.includes("/results")
        ? "Fetching the latest results…"
        : url.includes("/vote")
        ? "Loading ballots for you…"
        : "Preparing your next view…";
      setRouteMessage(pretty);
      setRouteLoading(true);
    };
    const handleEnd = () => setRouteLoading(false);
    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleEnd);
    router.events.on("routeChangeError", handleEnd);
    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleEnd);
      router.events.off("routeChangeError", handleEnd);
    };
  }, [router]);

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
      <LoadingCurtain active={routeLoading} message={routeMessage} variant="subtle" />
      <ToastContainer position="top-center" />
    </>
  );
}
