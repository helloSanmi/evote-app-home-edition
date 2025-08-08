// frontend/pages/admin.js
import { useState, useEffect } from "react";
import io from "socket.io-client";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

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

export default function Admin() {
  const [socket, setSocket] = useState(null);

  const [message, setMessage] = useState("");
  const [showPopup, setShowPopup] = useState(false);

  const [name, setName] = useState("");
  const [lga, setLga] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  // Note the change below: we'll treat 'published' as a boolean instead of 0 or 1
  const [unpublishedCandidates, setUnpublishedCandidates] = useState([]);
  const [publishedCandidates, setPublishedCandidates] = useState([]);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [period, setPeriod] = useState(null);

  const [results, setResults] = useState([]);
  const [activeTab, setActiveTab] = useState("current");

  const [periods, setPeriods] = useState([]);
  const [selectedPastPeriod, setSelectedPastPeriod] = useState(null);
  const [pastCandidates, setPastCandidates] = useState([]);
  const [pastResults, setPastResults] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };

  // Initialize Socket.io
  useEffect(() => {
    const newSocket = io("http://localhost:5000");
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;
    socket.on("candidatesUpdated", loadCandidates);
    socket.on("votingStarted", (data) => {
      setMessage(`Voting has started${data && data.periodId ? ` (Period ${data.periodId})` : ""}`);
      setShowPopup(true);
      loadCurrentPeriod();
      loadCandidates();
      loadResults();
    });
    socket.on("voteCast", loadResults);
    socket.on("resultsPublished", () => {
      setMessage("Results have been published");
      setShowPopup(true);
      loadCurrentPeriod();
      loadResults();
    });

    return () => {
      socket.off("candidatesUpdated");
      socket.off("votingStarted");
      socket.off("voteCast");
      socket.off("resultsPublished");
    };
  }, [socket]);

  const closePopup = () => {
    setShowPopup(false);
    setMessage("");
  };

  const loadCurrentPeriod = async () => {
    const res = await fetch(`${serverUrl}/api/admin/get-period`, { headers });
    const data = await res.json();
    setPeriod(data);
  };

  // IMPORTANT FIX HERE:
  // In MSSQL, a BIT column often returns true/false, not 1/0.
  // We'll filter with !c.published (unpublished) and c.published (published).
  const loadCandidates = async () => {
    const res = await fetch(`${serverUrl}/api/admin/get-candidates`, { headers });
    const data = await res.json();
    if (Array.isArray(data)) {
      // 'published' might be boolean (true/false). So filter accordingly:
      const unpublished = data.filter((c) => !c.published);
      const published = data.filter((c) => c.published);
      setUnpublishedCandidates(unpublished);
      setPublishedCandidates(published);
    }
  };

  const loadResults = async () => {
    const res = await fetch(`${serverUrl}/api/admin/results`, { headers });
    const data = await res.json();
    if (Array.isArray(data)) setResults(data);
  };

  const loadAllPeriods = async () => {
    const res = await fetch(`${serverUrl}/api/admin/periods`, { headers });
    const data = await res.json();
    if (Array.isArray(data)) setPeriods(data);
  };

  const loadPastPeriodData = async (pId) => {
    const candidatesRes = await fetch(`${serverUrl}/api/admin/candidates?periodId=${pId}`, {
      headers,
    });
    const candidatesData = await candidatesRes.json();
    setPastCandidates(candidatesData || []);
    const resultsRes = await fetch(`${serverUrl}/api/admin/results?periodId=${pId}`, {
      headers,
    });
    const resultsData = await resultsRes.json();
    setPastResults(resultsData || []);
  };

  useEffect(() => {
    loadCurrentPeriod();
    loadCandidates();
    loadResults();
    loadAllPeriods();
  }, []);

  useEffect(() => {
    if (selectedPastPeriod) loadPastPeriodData(selectedPastPeriod);
  }, [selectedPastPeriod]);

  const addCandidate = async () => {
    if (!name.trim() || !lga.trim()) {
      setMessage("Please provide candidate name and LGA");
      setShowPopup(true);
      return;
    }
    const res = await fetch(`${serverUrl}/api/admin/add-candidate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, lga, photoUrl }),
    });
    if (res.ok) {
      setName("");
      setLga("");
      setPhotoUrl("");
      setMessage("Candidate added successfully");
      setShowPopup(true);
      loadCandidates();
      socket?.emit("triggerUpdate", "candidatesUpdated");
    } else {
      setMessage("Error adding candidate");
      setShowPopup(true);
    }
  };

  const removeCandidate = async (candidateId) => {
    const res = await fetch(
      `${serverUrl}/api/admin/remove-candidate?candidateId=${candidateId}`,
      { method: "DELETE", headers }
    );
    if (res.ok) {
      setMessage("Candidate removed");
      setShowPopup(true);
      loadCandidates();
      socket?.emit("triggerUpdate", "candidatesUpdated");
    } else {
      setMessage("Error removing candidate");
      setShowPopup(true);
    }
  };

  const startVoting = async () => {
    if (!startTime || !endTime) {
      setMessage("Please select start and end times");
      setShowPopup(true);
      return;
    }
    const res = await fetch(`${serverUrl}/api/admin/start-voting`, {
      method: "POST",
      headers,
      body: JSON.stringify({ startTime, endTime }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessage(data.message);
      setShowPopup(true);
      setStartTime("");
      setEndTime("");
      loadCurrentPeriod();
      loadCandidates();
      loadResults();
      socket?.emit("triggerUpdate", "votingStarted", { periodId: data.periodId });
    } else {
      setMessage("Error starting voting");
      setShowPopup(true);
    }
  };

  const endVotingEarly = async () => {
    const res = await fetch(`${serverUrl}/api/admin/end-voting`, {
      method: "POST",
      headers,
    });
    if (res.ok) {
      setMessage("Voting ended early");
      setShowPopup(true);
      loadCurrentPeriod();
      socket?.emit("triggerUpdate", "votingStarted");
    } else {
      setMessage("Error ending voting");
      setShowPopup(true);
    }
  };

  const publishResults = async () => {
    const res = await fetch(`${serverUrl}/api/admin/publish-results`, {
      method: "POST",
      headers,
    });
    const data = await res.json();
    if (res.ok) {
      setMessage("Results published");
      setShowPopup(true);
      loadCurrentPeriod();
      loadResults();
      socket?.emit("triggerUpdate", "resultsPublished");
    } else {
      setMessage(data.error || "Error publishing results");
      setShowPopup(true);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 mt-10">
      <PopupModal show={showPopup} message={message} onClose={closePopup} />

      <h1 className="text-3xl font-bold text-gray-800 text-center">Administrative Page</h1>

      <div className="flex space-x-4 border-b pb-2 justify-center">
        <button
          onClick={() => setActiveTab("current")}
          className={`pb-2 ${activeTab === "current" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-600"}`}
        >
          Current Period
        </button>
        <button
          onClick={() => setActiveTab("past")}
          className={`pb-2 ${activeTab === "past" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-600"}`}
        >
          Past Periods
        </button>
      </div>

      {activeTab === "current" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-lg shadow space-y-4 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">Add Candidate (Unpublished)</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-full">
                <label className="block text-gray-700 text-sm mb-1">Candidate Name</label>
                <input
                  placeholder="Candidate Name"
                  className="border p-2 rounded w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="w-full">
                <label className="block text-gray-700 text-sm mb-1">LGA</label>
                <input
                  placeholder="LGA"
                  className="border p-2 rounded w-full"
                  value={lga}
                  onChange={(e) => setLga(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-gray-700 text-sm mb-1">Photo URL</label>
              <input
                placeholder="Photo URL"
                className="border p-2 rounded w-full"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </div>
            <button
              onClick={addCandidate}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
            >
              Add Candidate
            </button>

            <div className="mt-4 border p-4 rounded bg-gray-50 max-h-64 overflow-auto">
              <h3 className="text-lg font-bold mb-2">Unpublished Candidates</h3>
              {unpublishedCandidates.length === 0 && (
                <p className="text-gray-600 text-sm">No unpublished candidates yet</p>
              )}
              {unpublishedCandidates.map((c) => (
                <div key={c.id} className="flex justify-between items-center mb-2 bg-white p-2 rounded">
                  <span className="text-sm text-gray-700">
                    {c.name} ({c.lga})
                  </span>
                  <button
                    onClick={() => removeCandidate(c.id)}
                    className="bg-red-600 text-white px-2 py-1 rounded text-sm hover:bg-red-700 transition"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow space-y-4 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">Start Voting & Live Results</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-full">
                <label className="block text-gray-700 text-sm mb-1">Start Time</label>
                <input
                  type="datetime-local"
                  className="border p-2 rounded w-full"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="w-full">
                <label className="block text-gray-700 text-sm mb-1">End Time</label>
                <input
                  type="datetime-local"
                  className="border p-2 rounded w-full"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={startVoting}
              className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition"
            >
              Start Voting
            </button>

            {period && (
              <div className="text-gray-600 mt-4 text-sm">
                <p>Current Period ID: {period.id}</p>
                <p>Starts: {new Date(period.startTime).toLocaleString()}</p>
                <p>Ends: {new Date(period.endTime).toLocaleString()}</p>
                {!period.resultsPublished && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={endVotingEarly}
                      className="bg-red-600 text-white py-1 px-3 rounded hover:bg-red-700 transition"
                    >
                      End Voting Now
                    </button>
                    <button
                      onClick={publishResults}
                      className="bg-blue-600 text-white py-1 px-3 rounded hover:bg-blue-700 transition"
                    >
                      Publish Results
                    </button>
                  </div>
                )}
              </div>
            )}

            <h3 className="text-lg font-bold mt-6">Published Candidates</h3>
            <div className="border p-4 rounded bg-gray-50 max-h-48 overflow-auto">
              {publishedCandidates.length === 0 && (
                <p className="text-gray-600 text-sm">No published candidates yet</p>
              )}
              {publishedCandidates.map((c) => (
                <div key={c.id} className="text-sm text-gray-700 mb-2 bg-white p-2 rounded">
                  {c.name} ({c.lga})
                </div>
              ))}
            </div>

            <h3 className="text-lg font-bold mt-6">Live Results</h3>
            <div className="border p-4 rounded bg-gray-50 max-h-48 overflow-auto">
              {results.length === 0 && <p className="text-gray-600 text-sm">No votes yet</p>}
              {results.length > 0 && (
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border p-2">Candidate</th>
                      <th className="border p-2">LGA</th>
                      <th className="border p-2">Votes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.name}>
                        <td className="border p-2">{r.name}</td>
                        <td className="border p-2">{r.lga}</td>
                        <td className="border p-2">{r.votes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-lg shadow space-y-4 border border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">Preview Published Candidates</h2>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="bg-green-600 text-white py-1 px-3 rounded hover:bg-green-700 transition"
              >
                {showPreview ? "Hide Preview" : "Show Preview"}
              </button>
            </div>
            {showPreview && (
              <div className="border p-4 rounded mb-4 space-y-4 bg-gray-50 max-h-64 overflow-auto">
                <h3 className="text-lg font-bold">Published Candidates</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {publishedCandidates.map((c) => (
                    <div key={c.id} className="border p-4 rounded flex flex-col items-center bg-white">
                      <img
                        src={c.photoUrl || "/placeholder.png"}
                        alt={c.name}
                        className="w-24 h-24 rounded-full mb-2 object-cover"
                      />
                      <h4 className="font-semibold text-center text-gray-700 text-sm">{c.name}</h4>
                      <p className="text-xs text-center text-gray-600">{c.lga}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "past" && (
        <div className="bg-white p-6 rounded-lg shadow space-y-4 border border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">Past Voting Periods</h2>
            <button onClick={loadAllPeriods} className="bg-gray-200 hover:bg-gray-300 text-gray-800 py-1 px-3 rounded">
              Refresh Periods
            </button>
          </div>
          <select
            className="border p-2 rounded w-full"
            value={selectedPastPeriod || ""}
            onChange={(e) => setSelectedPastPeriod(e.target.value)}
          >
            <option value="">Select a Past Period</option>
            {periods
              .filter((p) => p.id !== (period ? period.id : null))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Period {p.id} (Starts: {new Date(p.startTime).toLocaleString()}, Ends: {new Date(p.endTime).toLocaleString()})
                </option>
              ))}
          </select>

          {selectedPastPeriod && pastCandidates.length > 0 && (
            <>
              <h3 className="text-lg font-bold text-gray-700 mt-4">Candidates for Period {selectedPastPeriod}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {pastCandidates.map((c) => (
                  <div key={c.id} className="border p-4 rounded flex flex-col items-center bg-gray-50">
                    <img
                      src={c.photoUrl || "/placeholder.png"}
                      alt={c.name}
                      className="w-24 h-24 rounded-full mb-2 object-cover"
                    />
                    <h4 className="font-semibold text-center text-gray-700">{c.name}</h4>
                    <p className="text-sm text-center text-gray-600">{c.lga}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-lg font-bold text-gray-700 mt-8">Results for Period {selectedPastPeriod}</h3>
              <div className="max-h-64 overflow-auto">
                <table className="w-full border-collapse text-left text-sm mt-4">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border p-2">Candidate</th>
                      <th className="border p-2">LGA</th>
                      <th className="border p-2">Votes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastResults.map((r) => (
                      <tr key={r.name}>
                        <td className="border p-2">{r.name}</td>
                        <td className="border p-2">{r.lga}</td>
                        <td className="border p-2">{r.votes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
