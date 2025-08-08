// frontend/pages/results.js
import { useState, useEffect } from "react";
import io from "socket.io-client";

function PopupModal({ show, message, onClose }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-md max-w-sm w-full text-center">
        <p className="mb-4 text-gray-700">{message}</p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          OK
        </button>
      </div>
    </div>
  );
}

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Results() {
  const [socket, setSocket] = useState(null);
  const [results, setResults] = useState([]);
  const [canView, setCanView] = useState(false);
  const [totalVotes, setTotalVotes] = useState(0);
  const [message, setMessage] = useState("");
  const [showPopup, setShowPopup] = useState(false);

  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const [periodId, setPeriodId] = useState(null);

  useEffect(() => {
    // We connect to the socket server
    const newSocket = io(serverUrl);
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (!socket) return;
    // When results are published, refresh
    socket.on("resultsPublished", () => {
      setMessage("Results have just been published!");
      setShowPopup(true);
      if (periodId && userId) fetchResults(periodId, userId);
    });
    socket.on("votingStarted", () => {
      // If a new voting started, reset this page if needed
      setResults([]);
      setCanView(false);
    });
    return () => {
      socket.off("resultsPublished");
      socket.off("votingStarted");
    };
  }, [socket, periodId, userId]);

  const closePopup = () => {
    setShowPopup(false);
    setMessage("");
  };

  // First, fetch the current period
  const fetchCurrentPeriod = async () => {
    const res = await fetch(`${serverUrl}/api/public/period`);
    const data = await res.json();
    if (data && data.id) {
      setPeriodId(data.id);
      // Once we have the period, fetch the results if user participated
      if (userId) fetchResults(data.id, userId);
    } else {
      setResults([]);
      setCanView(false);
    }
  };

  const fetchResults = async (pid, uid) => {
    const url = `${serverUrl}/api/public/public-results?periodId=${pid}&userId=${uid}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.noParticipation) {
      setCanView(false);
      setResults([]);
      setMessage("You didn't participate in this voting session, so you cannot view the results.");
      setShowPopup(true);
      return;
    }
    if (data.published) {
      setCanView(true);
      setResults(data.results);
      const sum = data.results.reduce((acc, cur) => acc + cur.votes, 0);
      setTotalVotes(sum);
    } else {
      setCanView(false);
      setResults([]);
    }
  };

  useEffect(() => {
    fetchCurrentPeriod();
  }, []);

  if (!canView) {
    return (
      <>
        <PopupModal show={showPopup} message={message} onClose={closePopup} />
        <div className="min-h-screen flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Results not available</h1>
            <p className="text-gray-700">
              {message || "Please wait until results are published or confirm you participated."}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PopupModal show={showPopup} message={message} onClose={closePopup} />
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-6 text-gray-800 text-center">Election Results</h1>
          <p className="mb-8 text-gray-700 text-center">Total Votes Cast: {totalVotes}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {results.map((result) => (
              <div
                key={result.name}
                className="border rounded-lg p-4 bg-gray-50 flex flex-col items-center text-center"
              >
                <img
                  src={result.photoUrl || "/placeholder.png"}
                  alt={result.name}
                  className="w-24 h-24 rounded-full mb-4 object-cover"
                />
                <h2 className="text-lg font-semibold text-gray-700">{result.name}</h2>
                <p className="text-sm text-gray-500 mb-2">{result.lga}</p>
                <span className="text-xl font-bold text-blue-600">{result.votes} Votes</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
