// frontend/pages/vote.js
import { useState, useEffect } from "react";
import io from "socket.io-client";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Vote() {
  const [socket, setSocket] = useState(null);
  const [period, setPeriod] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [votingNotStarted, setVotingNotStarted] = useState(true);
  const [votingEnded, setVotingEnded] = useState(false);
  const [resultsPublished, setResultsPublished] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [alreadyVotedCandidate, setAlreadyVotedCandidate] = useState(null);
  const [message, setMessage] = useState("");
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    const newSocket = io(serverUrl);
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  // Listen for admin starting voting
  useEffect(() => {
    if (!socket) return;
    socket.on("votingStarted", () => {
      fetchPeriod();
      fetchCandidates();
    });
    return () => {
      socket.off("votingStarted");
    };
  }, [socket]);

  const fetchPeriod = async () => {
    const res = await fetch(`${serverUrl}/api/public/period`);
    const data = await res.json();
    setPeriod(data);
    if (!data) return;
    const now = new Date();
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    const forcedEnded = data.forcedEnded === true || data.forcedEnded === 1;
    setResultsPublished(data.resultsPublished === true || data.resultsPublished === 1);
    if (forcedEnded || now > end) {
      setVotingEnded(true);
      setVotingNotStarted(false);
    } else if (now < start) {
      setVotingNotStarted(true);
      calculateTimeLeft(start);
    } else if (now >= start && now <= end) {
      setVotingNotStarted(false);
      calculateTimeLeft(end);
    }
  };

  const fetchCandidates = async () => {
    if (!period) return;
    const res = await fetch(`${serverUrl}/api/public/candidates?periodId=${period.id}`);
    const data = await res.json();
    setCandidates(data);
  };

  const checkUserVote = async () => {
    if (!userId || !period) return;
    const res = await fetch(
      `${serverUrl}/api/public/uservote?userId=${userId}&periodId=${period.id}`
    );
    const voteData = await res.json();
    if (voteData && voteData.candidateId) {
      setSelectedCandidate(voteData.candidateId);
      const votedFor = candidates.find((c) => c.id === voteData.candidateId);
      if (votedFor) setAlreadyVotedCandidate(votedFor.name);
    }
  };

  const calculateTimeLeft = (target) => {
    const now = new Date();
    const diff = target - now;
    if (diff <= 0) {
      fetchPeriod();
      return;
    }
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    setTimeout(() => calculateTimeLeft(target), 1000);
  };

  const handleVote = async () => {
    if (!selectedCandidate || votingNotStarted || votingEnded) return;
    if (!token || !userId) {
      setMessage("Please login first.");
      return;
    }
    if (alreadyVotedCandidate) return;
    const res = await fetch(`${serverUrl}/api/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: parseInt(userId), candidateId: selectedCandidate }),
    });
    if (res.ok) {
      setShowVoteModal(true);
      const votedFor = candidates.find((c) => c.id === selectedCandidate);
      if (votedFor) setAlreadyVotedCandidate(votedFor.name);
    }
  };

  useEffect(() => {
    fetchPeriod();
    // We'll fetch candidates after we know the period
  }, []);

  useEffect(() => {
    if (period) {
      fetchCandidates();
    }
  }, [period]);

  useEffect(() => {
    if (candidates.length > 0 && period) {
      checkUserVote();
    }
  }, [candidates, period]);

  if (!period) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-4">No Voting Currently</h2>
          <p className="mb-4 text-gray-700">
            No voting session is active right now. Please check back later!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-3xl relative text-center">
        {votingNotStarted && !votingEnded ? (
          <>
            <h2 className="text-2xl font-bold mb-4">Voting has not started yet</h2>
            {timeLeft && <p className="text-lg">Starts in: {timeLeft}</p>}
            <p className="mt-4 text-gray-600">
              Check back once the countdown finishes.
            </p>
          </>
        ) : null}

        {!votingNotStarted && !votingEnded && (
          <>
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Vote for Your Candidate</h1>
            {timeLeft && <p className="mb-4">Voting ends in: {timeLeft}</p>}
            {alreadyVotedCandidate && (
              <p className="mb-2 text-green-600 font-semibold">
                You have already voted for {alreadyVotedCandidate}.
              </p>
            )}
            {candidates.length === 0 && (
              <p className="text-center text-gray-700">No candidates available.</p>
            )}
            {candidates.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {candidates.map((candidate) => {
                  const isSelected = selectedCandidate === candidate.id;
                  const isDisabled = alreadyVotedCandidate && !isSelected;
                  return (
                    <div
                      key={candidate.id}
                      onClick={() => {
                        if (!alreadyVotedCandidate) setSelectedCandidate(candidate.id);
                      }}
                      className={`cursor-pointer border rounded-lg p-4 flex flex-col items-center text-center bg-gray-50
                        ${isSelected ? "border-blue-500" : "border-gray-300"}
                        ${isDisabled ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <img
                        src={candidate.photoUrl || "/placeholder.png"}
                        alt={candidate.name}
                        className="w-24 h-24 rounded-full mb-4 object-cover"
                      />
                      <h2 className="text-lg font-medium text-gray-700">{candidate.name}</h2>
                      <p className="text-sm text-gray-500">{candidate.lga}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {!alreadyVotedCandidate && selectedCandidate && candidates.length > 0 && (
              <button
                onClick={handleVote}
                className="mt-6 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition"
              >
                Submit Vote
              </button>
            )}
            {alreadyVotedCandidate && (
              <p className="mt-4 text-gray-600">You have already cast your vote. Thank you!</p>
            )}
          </>
        )}

        {votingEnded && (
          <>
            <h2 className="text-2xl font-bold mb-4">Voting has ended</h2>
            {!resultsPublished && <p>Results will be published soon.</p>}
            {resultsPublished && (
              <div className="flex flex-col space-y-4 items-center mt-4">
                <a
                  href="/results"
                  className="text-white bg-blue-600 px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  View Current Results
                </a>
                <a href="/past-results" className="text-blue-600 underline">
                  View Past Results
                </a>
              </div>
            )}
          </>
        )}

        {showVoteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded p-6 shadow-md w-full max-w-sm text-center">
              <h2 className="text-xl font-bold mb-4">Vote Submitted</h2>
              <p className="mb-4">Your vote has been recorded successfully!</p>
              <button
                onClick={() => setShowVoteModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
