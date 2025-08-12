// This component displays a modal with a message and a close button.
// It's used for displaying error messages or other user feedback.

// components/PopupModal.js

function PopupModal({ show, message, onClose }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-center border-2 border-gray-200">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Attention</h2>
        <p className="text-gray-700 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default PopupModal;
