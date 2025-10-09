// frontend/lib/socket.js
import { io } from "socket.io-client";
import { api } from "./apiBase";

// Always build a valid absolute URL for socket.io
let socket = null;
export function getSocket() {
  if (!socket) {
    let base = api;
    if (!base) {
      if (typeof window !== "undefined") {
        // dev fallback: swap :3000 -> :5050 if needed
        const origin = window.location.origin;
        base = origin.replace(":3000", ":5050");
      } else {
        base = "http://localhost:5050";
      }
    }
    socket = io(base, { transports: ["websocket", "polling"], withCredentials: true });
    socket.on("connect", () => {
      if (typeof window === "undefined") return;
      const token = localStorage.getItem("token");
      if (token) {
        const role = (localStorage.getItem("role") || "user").toLowerCase();
        socket.emit("identify", { token, role });
      }
    });
  }
  return socket;
}

export function reidentifySocket() {
  if (!socket) return;
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("token");
  if (token) {
    const role = (localStorage.getItem("role") || "user").toLowerCase();
    socket.emit("identify", { token, role });
  }
}
