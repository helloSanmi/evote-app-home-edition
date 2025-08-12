// frontend/components/Toast.js
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export const notifySuccess = (msg) =>
  toast.success(msg, { position: "top-center", autoClose: 3000 });

export const notifyError = (msg) =>
  toast.error(msg, { position: "top-center", autoClose: 4000 });

export const notifyInfo = (msg) =>
  toast.info(msg, { position: "top-center", autoClose: 3000 });
