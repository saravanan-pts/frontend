"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, Loader2, X } from "lucide-react"; // Removed AlertCircle/CheckCircle to fix crash
import { toast } from "react-hot-toast";
import { useGraphStore } from "@/lib/store";
import { useGraph } from "@/hooks/useGraph";

export default function FileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const { loadGraph } = useGraph();
  const { setActiveTab } = useGraphStore();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Check size limit (50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File is too large. Max 50MB.");
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("Processing file...");

    try {
      const textContent = await file.text();

      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          textContent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      toast.success(`Successfully processed ${file.name}`, { id: toastId });
      
      // Reload graph and switch to details view
      await loadGraph(null);
      setActiveTab("details");

    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to process file", { id: toastId });
    } finally {
      setIsUploading(false);
    }
  }, [loadGraph, setActiveTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt', '.md'],
      'application/json': ['.json']
    },
    maxFiles: 1,
    multiple: false
  });

  return (
    <div className="p-4 space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}
          ${isUploading ? "opacity-50 pointer-events-none" : ""}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center gap-3">
          {isUploading ? (
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          ) : (
            <div className="p-3 bg-gray-100 rounded-full">
              <Upload className="w-6 h-6 text-gray-600" />
            </div>
          )}
          
          <div className="text-sm text-gray-600">
            {isUploading ? (
              <p>Uploading and processing...</p>
            ) : isDragActive ? (
              <p className="text-blue-600 font-medium">Drop the file here</p>
            ) : (
              <>
                <p className="font-medium text-gray-900">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">CSV, TXT, JSON (Max 50MB)</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}