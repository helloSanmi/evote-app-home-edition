// frontend/components/Modal.js
import { createContext, useCallback, useContext, useMemo, useState } from "react";

const Ctx = createContext(null);

export function ModalProvider({ children }) {
  const [modal, setModal] = useState({ open: false });

  const close = useCallback(() => setModal({ open: false }), []);
  const open = useCallback((opts) => {
    setModal({ open: true, ...opts });
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {modal.open && (
        <div className="fixed inset-0 z-[9999]">
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              {modal.title && <h3 className="text-lg font-bold mb-2">{modal.title}</h3>}
              {modal.message && <p className="text-gray-700 mb-4 whitespace-pre-wrap">{modal.message}</p>}
              <div className="flex justify-end gap-2">
                {modal.onCancel && (
                  <button
                    onClick={() => { modal.onCancel(); close(); }}
                    className="px-4 py-2 rounded border hover:bg-gray-50"
                  >
                    {modal.cancelText || "Close"}
                  </button>
                )}
                <button
                  onClick={() => { modal.onConfirm ? modal.onConfirm() : null; close(); }}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  {modal.confirmText || "OK"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}
