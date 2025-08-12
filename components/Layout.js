// frontend/components/Layout.js
import Navbar from "./Navbar";
export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="py-6">{children}</main>
    </div>
  );
}
