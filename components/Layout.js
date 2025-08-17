// frontend/components/Layout.js
import Navbar from "./Navbar";

export default function Layout({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar */}
      <Navbar />

      {/* Page content */}
      <main className="flex-grow">{children}</main>

      {/* Sticky footer with subtle hover effect */}
      <footer className="bg-white/90 backdrop-blur border-t py-3 text-center text-sm text-gray-600 transition hover:bg-gray-50">
        © 2025 <span className="font-semibold">Tech Analytics</span>
      </footer>
    </div>
  );
}
