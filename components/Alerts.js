// frontend/components/Alert.js
export default function Alert({ show, type = "error", message = "", onClose }) {
  if (!show) return null;
  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`px-4 py-3 rounded shadow text-white ${type === "error" ? "bg-red-600" : "bg-green-600"}`}>
        <div className="flex items-center gap-3">
          <span>{message}</span>
          <button onClick={onClose} className="ml-2 underline text-white/90">Close</button>
        </div>
      </div>
    </div>
  );
}
