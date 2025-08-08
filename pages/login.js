// frontend/pages/login.js
// Add "Forgot Password" link which opens a modal to enter email.
// No backend logic implemented here, just show UI. On submit, show a message (simulate process).

import { useState } from "react";
import { useRouter } from "next/router";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showModal, setShowModal] = useState(false);
  const [errorModal, setErrorModal] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const router = useRouter();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({...formData, [name]: value.trim()});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const res = await fetch(`${serverUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(formData)
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok && data.token) {
      localStorage.setItem("token", data.token);
      const meRes = await fetch(`${serverUrl}/api/auth/me`, {
        headers: {
          "Authorization": "Bearer " + data.token
        }
      });
      const meData = await meRes.json();
      if (meRes.ok && meData.id) {
        if (data.isAdmin) {
          localStorage.setItem("isAdmin", "true");
          localStorage.setItem("userId", meData.id);
          router.push("/admin");
        } else {
          localStorage.removeItem("isAdmin");
          localStorage.setItem("userId", meData.id);
          router.push("/");
        }
      } else {
        setErrorModal(true);
        setMessage("Invalid credentials");
      }
    } else {
      if (data.error && data.error.includes("not found")) {
        setShowModal(true);
      } else {
        setErrorModal(true);
        setMessage("Invalid credentials");
      }
    }
  };

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    // Simulate sending reset link
    setForgotMessage("If this email is registered, a password reset link will be sent shortly.");
  };

  return (
    <div className="relative w-full max-w-md mx-auto mt-20">
      <div className="bg-white p-8 rounded-lg shadow-md w-full border border-gray-200">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 text-center">Login</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email or Username</label>
            <input
              type="text"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
              placeholder="Enter your email or username"
              required
              minLength={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
              placeholder="Enter your password"
              required
              minLength={6}
              title="Password must be at least 6 characters long"
            />
          </div>
          <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-blue-700 transition">
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="loader ease-linear rounded-full border-4 border-t-4 border-white h-5 w-5 mr-2"></div>
                Logging in...
              </div>
            ) : (
              "Login"
            )}
          </button>
        </form>
        <div className="text-center mt-4">
          <button onClick={() => setShowForgotModal(true)} className="text-blue-600 underline text-sm">Forgot Password?</button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 shadow-md w-full max-w-sm">
            <h2 className="text-xl font-bold mb-4">User not found</h2>
            <p className="mb-4">You have not registered yet. Would you like to register?</p>
            <div className="flex space-x-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowModal(false); router.push("/register"); }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      )}

      {errorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 shadow-md w-full max-w-sm text-center">
            <p className="mb-4 text-gray-700">{message}</p>
            <button
              onClick={() => setErrorModal(false)}
              className="px-4 py-2 bg-red-200 text-gray-800 rounded hover:bg-red-300 transition"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showForgotModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 shadow-md w-full max-w-sm">
            <h2 className="text-xl font-bold mb-4 text-center">Reset Password</h2>
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your email</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value.trim())}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
                  placeholder="yourname@example.com"
                  required
                  pattern="^[^@\s]+@[^@\s]+\.[^@\s]+$"
                />
              </div>
              <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-blue-700 transition">
                Send Reset Link
              </button>
            </form>
            {forgotMessage && <p className="mt-4 text-gray-700 text-center">{forgotMessage}</p>}
            <div className="text-center mt-4">
              <button onClick={() => {setShowForgotModal(false); setForgotMessage("");}} className="text-gray-600 underline text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .loader {
          border-top-color: transparent;
          animation: spinner 0.6s linear infinite;
        }
        @keyframes spinner {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
