// frontend/components/Toast.js
import { toast } from "react-toastify";

const base = {
  position: "top-center",
  autoClose: 2200,
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
  theme: "colored",
  icon: false,
  // big card style
  className: "shadow-lg rounded-xl !px-5 !py-4 !text-base",
  bodyClassName: "!p-0",
};

export function notifySuccess(msg) {
  toast.dismiss();
  toast.success(
    <div className="text-white">
      <div className="font-semibold">Success</div>
      <div className="opacity-90">{msg}</div>
    </div>,
    base
  );
}

export function notifyError(msg) {
  toast.dismiss();
  toast.error(
    <div className="text-white">
      <div className="font-semibold">Oops</div>
      <div className="opacity-90">{msg}</div>
    </div>,
    base
  );
}

export function notifyInfo(msg) {
  toast.dismiss();
  toast.info(
    <div className="text-white">
      <div className="font-semibold">Notice</div>
      <div className="opacity-90">{msg}</div>
    </div>,
    base
  );
}
