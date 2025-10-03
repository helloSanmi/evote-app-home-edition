// frontend/components/Layout.js
import Navbar from "./Navbar";
import CookieBanner from "./CookieBanner";

export default function Layout({ children }) {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[9]
          bg-[radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.16),transparent_65%)]"
      />
      <Navbar />
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 lg:py-10">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-200/60 bg-white backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm text-slate-600 md:px-8">
          <span>© {new Date().getFullYear()} Tech Analytics</span>
          <a className="hover:text-slate-900 transition-colors" href="/faq">FAQ</a>
        </div>
      </footer>
      <CookieBanner />
    </div>
  );
}
