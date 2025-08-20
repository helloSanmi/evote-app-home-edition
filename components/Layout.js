// frontend/components/Layout.js
import Navbar from "./Navbar";
import CookieBanner from "./CookieBanner";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 text-sm text-gray-600 flex items-center justify-between">
          <span>© 2025 Tech Analytics</span>
          <a
            className="hover:text-gray-900 transition"
            href="/faq"
          >
            FAQ
          </a>
        </div>
      </footer>
      <CookieBanner />
    </div>
  );
}
