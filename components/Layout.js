// frontend/components/Layout.js
import Navbar from "./Navbar";

export default function Layout({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar always at top */}
      <Navbar />

      {/* Page content grows to fill space */}
      <main className="flex-grow">{children}</main>

      {/* Sticky footer */}
      <footer className="bg-gray-100 border-t py-3 text-center text-sm text-gray-600">
        © 2025 Tech Analytics
      </footer>
    </div>
  );
}
