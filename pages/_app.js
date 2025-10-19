// pages/_app.js
import "../styles/globals.css";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Head from "next/head";
import Layout from "../components/Layout";
import { notifyInfo, notifyError } from "../components/Toast";
import { apiPost } from "../lib/apiBase";
import { getSocket, reidentifySocket } from "../lib/socket";

export default function App({ Component, pageProps }) {
  const router = useRouter();

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
        if (data.fullName) {
          localStorage.setItem("fullName", data.fullName);
        } else {
          localStorage.removeItem("fullName");
        }
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

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
      <ToastContainer position="top-center" />
    </>
  );
}
