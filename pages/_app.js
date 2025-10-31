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
import { NotificationsProvider } from "../components/NotificationsProvider";
import { forceLogout } from "../lib/logout";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const disableFooter = Component.disableGlobalFooter || false;
  const fullWidthLayout = Component.fullWidthLayout || false;

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
        if (data.email) {
          localStorage.setItem("email", data.email);
        } else {
          localStorage.removeItem("email");
        }
        if (data.profilePhoto) localStorage.setItem("profilePhoto", data.profilePhoto);
        if (typeof data.requiresProfileCompletion === "boolean") {
          if (data.requiresProfileCompletion) {
            localStorage.setItem("needsProfileCompletion", "true");
          } else {
            localStorage.removeItem("needsProfileCompletion");
          }
        } else if (data.role === "admin" || data.role === "super-admin") {
          localStorage.removeItem("needsProfileCompletion");
        }
        if (typeof data.requiresPasswordReset === "boolean") {
          if (data.requiresPasswordReset) {
            localStorage.setItem("needsPasswordReset", "true");
          } else {
            localStorage.removeItem("needsPasswordReset");
          }
        }
        if (data.verificationStatus) {
          localStorage.setItem("verificationStatus", data.verificationStatus.toLowerCase());
        } else {
          localStorage.removeItem("verificationStatus");
        }
        if (typeof data.requiresVerification === "boolean") {
          if (data.requiresVerification) {
            localStorage.setItem("needsVerification", "true");
          } else {
            localStorage.removeItem("needsVerification");
          }
        } else if (data.verificationStatus && data.verificationStatus.toLowerCase() === "verified") {
          localStorage.removeItem("needsVerification");
        }
        if (typeof data.emailVerified === "boolean") {
          localStorage.setItem("emailVerified", data.emailVerified ? "true" : "false");
        } else {
          localStorage.removeItem("emailVerified");
        }
        if (data.requiresEmailVerification) {
          localStorage.setItem("needsEmailVerification", "true");
        } else {
          localStorage.removeItem("needsEmailVerification");
        }
        window.dispatchEvent(new Event("storage"));
        reidentifySocket();
        const elevated = data.role === "admin" || data.role === "super-admin";
        notifyInfo(elevated ? "Admin access enabled." : "Admin access removed.");
        const onAdminRoute = router.pathname.startsWith("/admin");
        if (elevated) {
          if (!onAdminRoute) router.replace("/admin");
        } else if (onAdminRoute) {
          router.replace("/");
        }
      } catch (err) {
        notifyError(err.message || "Failed to refresh permissions");
      }
    };

    const handleAccountDeleted = () => {
      forceLogout({
        notify: () => notifyError("Your account has been removed. Please contact support if you believe this is an error."),
      });
    };

    socket.on("roleUpdated", handleRoleUpdated);
    socket.on("accountDeleted", handleAccountDeleted);
    return () => {
      socket.off("roleUpdated", handleRoleUpdated);
      socket.off("accountDeleted", handleAccountDeleted);
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const enforceAccountFlows = () => {
      const token = localStorage.getItem("token");
      const needsPasswordReset = localStorage.getItem("needsPasswordReset") === "true";
      const needsCompletion = localStorage.getItem("needsProfileCompletion") === "true";
      const needsVerification = localStorage.getItem("needsVerification") === "true";
      const verificationStatus = (localStorage.getItem("verificationStatus") || "none").toLowerCase();
      const role = (localStorage.getItem("role") || "user").toLowerCase();
      const privileged = role === "admin" || role === "super-admin";
      if (token && needsPasswordReset && router.pathname !== "/force-password-reset") {
        router.replace("/force-password-reset");
        return;
      }
      if (token && needsCompletion && !privileged && router.pathname !== "/complete-profile") {
        router.replace("/complete-profile");
        return;
      }
      if (
        token &&
        !privileged &&
        needsVerification &&
        verificationStatus !== "verified" &&
        router.pathname !== "/verification-required" &&
        !router.pathname.startsWith("/profile")
      ) {
        router.replace("/verification-required");
      }
    };
    enforceAccountFlows();
    const handleRouteChange = () => enforceAccountFlows();
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, [router]);

  return (
    <NotificationsProvider>
      <Head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </Head>
      <Layout disableFooter={disableFooter} fullWidth={fullWidthLayout}>
        <Component {...pageProps} />
      </Layout>
      <ToastContainer position="top-center" />
    </NotificationsProvider>
  );
}
