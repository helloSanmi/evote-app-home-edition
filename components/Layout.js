// components/Layout.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Layout({ children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkComplete, setCheckComplete] = useState(false);
  const [userName, setUserName] = useState("");
  const router = useRouter();

  // Fetch user data and determine admin/regular user
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setLoggedIn(false);
      setIsAdmin(false);
      setUserName("");
      setCheckComplete(true);
      return;
    }

    const fetchUser = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/auth/me`, {
          headers: { Authorization: "Bearer " + token },
        });
        if (res.ok) {
          const userData = await res.json();
          setLoggedIn(true);
          // Extract first name
          let firstName = "User";
          if (userData.fullName && userData.fullName.trim()) {
            firstName = userData.fullName.split(" ")[0];
          } else if (userData.username && userData.username.trim()) {
            firstName = userData.username;
          } else if (userData.email && userData.email.includes("@")) {
            firstName = userData.email.split("@")[0];
          }
          setUserName(firstName);

          const adminFlag = localStorage.getItem("isAdmin");
          setIsAdmin(adminFlag === "true");
        } else {
          // Token invalid or expired
          localStorage.removeItem("token");
          setLoggedIn(false);
          setIsAdmin(false);
          setUserName("");
        }
      } catch {
        // Fetch error
        localStorage.removeItem("token");
        setLoggedIn(false);
        setIsAdmin(false);
        setUserName("");
      }
      setCheckComplete(true);
    };
    fetchUser();
  }, [router]);

  // Handle route transitions for a loading indicator
  useEffect(() => {
    const handleStart = () => setLoading(true);
    const handleStop = () => setLoading(false);

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleStop);
    router.events.on("routeChangeError", handleStop);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleStop);
      router.events.off("routeChangeError", handleStop);
    };
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("isAdmin");
    router.push("/");
  };

  if (!checkComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="loader ease-linear rounded-full border-4 border-t-4 border-blue-500 h-12 w-12"></div>
        <style jsx>{`
          .loader {
            border-top-color: #3498db;
            animation: spinner 1s linear infinite;
          }
          @keyframes spinner {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  const isAdminPage = router.pathname === "/admin";

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 relative">
      {/* Top Navbar */}
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
          <div className="loader ease-linear rounded-full border-4 border-t-4 border-blue-500 h-12 w-12"></div>
          <style jsx>{`
            .loader {
              border-top-color: #3498db;
              animation: spinner 1s linear infinite;
            }
            @keyframes spinner {
              0% {
                transform: rotate(0deg);
              }
              100% {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </div>
      )}
      <header className="bg-gradient-to-r from-blue-600 to-blue-500 shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
          {/* Logo + Greeting */}
          <div className="flex items-center space-x-4">
            <Link href="/">
              {/* Reuse your logo.png as a brand image */}
              <img
                src="/logo.png"
                alt="App Logo"
                className="h-10 w-10 rounded-full border border-white shadow-lg cursor-pointer"
              />
            </Link>
            {loggedIn && userName && (
              <span className="text-white font-semibold text-lg">
                Welcome back, {userName}!
              </span>
            )}
          </div>

          {/* Nav Links */}
          <nav className="flex flex-wrap space-x-4 items-center justify-center">
            {!loggedIn && (
              <>
                <Link href="/register">
                  <span className="cursor-pointer px-3 py-1 bg-white text-blue-600 font-medium rounded hover:bg-blue-100 hover:scale-105 transform transition">
                    Register
                  </span>
                </Link>
                <Link href="/login">
                  <span className="cursor-pointer px-3 py-1 bg-white text-blue-600 font-medium rounded hover:bg-blue-100 hover:scale-105 transform transition">
                    Login
                  </span>
                </Link>
              </>
            )}
            {loggedIn && !isAdmin && (
              <>
                <Link href="/vote">
                  <span className="cursor-pointer px-3 py-1 bg-white text-blue-600 font-medium rounded hover:bg-blue-100 hover:scale-105 transform transition">
                    Vote
                  </span>
                </Link>
                <Link href="/results">
                  <span className="cursor-pointer px-3 py-1 bg-white text-blue-600 font-medium rounded hover:bg-blue-100 hover:scale-105 transform transition">
                    Results
                  </span>
                </Link>
                <Link href="/past-results">
                  <span className="cursor-pointer px-3 py-1 bg-white text-blue-600 font-medium rounded hover:bg-blue-100 hover:scale-105 transform transition">
                    Past Results
                  </span>
                </Link>
              </>
            )}
            {loggedIn && isAdmin && !isAdminPage && (
              <Link href="/admin">
                <span className="cursor-pointer px-3 py-1 bg-white text-blue-600 font-medium rounded hover:bg-blue-100 hover:scale-105 transform transition">
                  Admin
                </span>
              </Link>
            )}
            {loggedIn && (
              <span
                onClick={handleLogout}
                className="cursor-pointer px-3 py-1 bg-red-100 text-red-700 font-medium rounded hover:bg-red-200 hover:scale-105 transform transition"
              >
                Logout
              </span>
            )}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="p-4 bg-gray-200 text-center text-sm text-gray-700 shadow-inner">
        &copy; {new Date().getFullYear()} Voting App. All rights reserved.
      </footer>
    </div>
  );
}
