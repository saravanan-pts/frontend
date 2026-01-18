"use client";

import { useEffect, useRef } from "react";
import { X, Info, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";

interface AlertDialogProps {
  title: string;
  message: string;
  onClose: () => void;
  type?: "info" | "success" | "error" | "warning";
}

export default function AlertDialog({
  title,
  message,
  onClose,
  type = "info",
}: AlertDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const okButtonRef = useRef<HTMLButtonElement>(null);

  // Focus OK button on mount
  useEffect(() => {
    okButtonRef.current?.focus();
  }, []);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Handle Enter key
  useEffect(() => {
    const handleEnter = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleEnter);

    return () => {
      document.removeEventListener("keydown", handleEnter);
    };
  }, [onClose]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />;
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case "success":
        return "bg-green-600 hover:bg-green-700";
      case "error":
        return "bg-red-600 hover:bg-red-700";
      case "warning":
        return "bg-yellow-600 hover:bg-yellow-700";
      default:
        return "bg-blue-600 hover:bg-blue-700";
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div
        ref={dialogRef}
        className="bg-[#1E293B] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[#334155]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#334155] flex items-center gap-3">
          {getIcon()}
          <h2 className="text-xl font-semibold text-white flex-1">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-full"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Message */}
        <div className="px-6 py-4">
          <p className="text-gray-300">{message}</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#334155] flex items-center justify-end">
          <button
            ref={okButtonRef}
            onClick={onClose}
            className={`px-4 py-2 text-white font-semibold rounded ${getButtonColor()}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

