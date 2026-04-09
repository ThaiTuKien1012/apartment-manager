import { useEffect, useState } from "react";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, ...e.detail }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000); // Tự động ẩn sau 3 giây
    };
    window.addEventListener("SHOW_TOAST", handleToast);
    return () => window.removeEventListener("SHOW_TOAST", handleToast);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-6 py-3 rounded-full shadow-2xl font-medium text-sm transition-all animate-in slide-in-from-bottom-6 fade-in duration-300 ${
            t.type === "error"
              ? "bg-error text-white"
              : "bg-surface-container-highest text-on-surface border border-outline-variant/20"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {t.type === "error" ? "error" : "check_circle"}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
