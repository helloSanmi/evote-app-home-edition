// frontend/pages/register.js
import { useState } from "react";
import { useRouter } from "next/router";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Register() {
  const [formData, setFormData] = useState({ fullName: "", username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [errorModal, setErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  // Allow spaces in the fullName field by not trimming the value
  const handleChange = (e) => {
    const { name, value } = e.target;
    // Do NOT trim the value, so spaces remain intact
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Register
      const res = await fetch(`${serverUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setErrorModal(true);
        setErrorMessage(data.error || "Error registering user");
        return;
      }

      // Auto-login after successful registration
      const loginRes = await fetch(`${serverUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.token) {
        setErrorModal(true);
        setErrorMessage("Error logging in after registration");
        return;
      }

      // Store token, fetch user info
      localStorage.setItem("token", loginData.token);
      const meRes = await fetch(`${serverUrl}/api/auth/me`, {
        headers: { "Authorization": "Bearer " + loginData.token },
      });
      const meData = await meRes.json();
      if (!meRes.ok || !meData.id) {
        setErrorModal(true);
        setErrorMessage("Error fetching user info");
        return;
      }

      // Determine admin or normal user
      if (loginData.isAdmin) {
        localStorage.setItem("isAdmin", "true");
        localStorage.setItem("userId", meData.id);
        router.push("/admin");
      } else {
        localStorage.removeItem("isAdmin");
        localStorage.setItem("userId", meData.id);
        router.push("/");
      }
    } catch (error) {
      setLoading(false);
      setErrorModal(true);
      setErrorMessage("Network or server error occurred");
    }
  };

  return (
    <div className="relative w-full max-w-md mx-auto mt-20">
      <div className="bg-white p-8 rounded-lg shadow-md w-full border border-gray-200">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 text-center">Register</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
              placeholder="Your full name"
              required
              minLength={3}
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
              placeholder="Choose a username"
              required
              minLength={3}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
              placeholder="yourname@example.com"
              required
              pattern="^[^@\s]+@[^@\s]+\.[^@\s]+$"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
              placeholder="Choose a strong password"
              required
              minLength={6}
              title="Password must be at least 6 characters long"
            />
          </div>

          {/* Submit Button */}
          <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-blue-700 transition">
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="loader ease-linear rounded-full border-4 border-t-4 border-white h-5 w-5 mr-2"></div>
                Registering...
              </div>
            ) : (
              "Register"
            )}
          </button>
        </form>

        <div className="text-center mt-4">
          <a href="/login" className="text-blue-600 underline text-sm">
            Already have an account? Go to Login
          </a>
        </div>
      </div>

      {/* Error Modal */}
      {errorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 shadow-md w-full max-w-sm text-center">
            <p className="mb-4 text-gray-700">{errorMessage}</p>
            <button
              onClick={() => setErrorModal(false)}
              className="px-4 py-2 bg-red-200 text-gray-800 rounded hover:bg-red-300 transition"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .loader {
          border-top-color: transparent;
          animation: spinner 0.6s linear infinite;
        }
        @keyframes spinner {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
