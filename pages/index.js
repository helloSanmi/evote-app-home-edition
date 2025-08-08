// Add link to FAQ and Contact in the homepage or navbar if desired
// Example adding in homepage (frontend/pages/index.js) a link to FAQ

// frontend/pages/index.js
import { useEffect, useState } from 'react';
const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoggedIn(false);
    } else {
      fetch(`${serverUrl}/api/auth/me`, {
        headers: { "Authorization": "Bearer " + token }
      })
      .then(res => res.json())
      .then(data => {
        if (data.id) {
          setLoggedIn(true);
          setUserName(data.name);
        } else {
          setLoggedIn(false);
        }
      })
      .catch(() => setLoggedIn(false));
    }
  }, []);

  return (
    <div className="text-center max-w-lg mx-auto space-y-6">
      {loggedIn ? (
        <>
          <h1 className="text-4xl font-bold text-blue-600">Welcome back, {userName}!</h1>
          <p className="mt-4 text-gray-700">You can now participate in voting or view results. If you have any questions, check out our FAQ.</p>
        </>
      ) : (
        <>
          <h1 className="text-4xl font-bold text-blue-600">Welcome to the Voting App</h1>
          <p className="mt-4 text-gray-700">Register or Log in to get started. If you have questions, visit our FAQ.</p>
        </>
      )}
      <div className="mt-8 text-left bg-white p-6 rounded-lg shadow-md space-y-4">
        <h2 className="text-2xl font-bold text-gray-800">About Our Voting Platform</h2>
        <p className="text-gray-700">
          Our platform is secure, scalable, and user-friendly. It ensures a fair and transparent process. Only one vote per user per session, and results are published when the admin deems it ready.
        </p>
        <p className="text-gray-700">
          Check our <a href="/faq" className="text-blue-600 underline">FAQ</a> for more info.
        </p>
      </div>
    </div>
  );
}
