// frontend/components/Layout.js
import Navbar from "./Navbar";
import { ModalProvider } from "./Modal";

export default function Layout({ children }) {
  return (
    <ModalProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 bg-gray-50">{children}</main>
        <footer className="sticky bottom-0 bg-white/90 backdrop-blur border-t">
          <div className="max-w-6xl mx-auto px-4 py-3 text-sm text-gray-600 flex items-center justify-between">
            <div>&copy; 2025 Tech Analytics</div>
            <div>E-Voting</div>
          </div>
        </footer>
      </div>
    </ModalProvider>
  );
}
