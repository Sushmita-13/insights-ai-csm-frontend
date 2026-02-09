"use client";

import { useState, useRef } from "react";

export default function DashboardPage() {
  const [status, setStatus] = useState<"idle" | "connected" | "recording" | "processing" | "error">("idle");
  const [transcription, setTranscription] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- Step 1: Connection Test ---
  const handleConnect = async () => {
    setStatus("connecting" as any);
    try {
      // Use http://localhost:5007/docs as a reliable health check
      const response = await fetch("http://localhost:5007/docs", {
        method: "GET",
        mode: "cors",
      });
      if (response.ok) setStatus("connected");
      else setStatus("error");
    } catch (err) {
      console.error("Connection failed:", err);
      setStatus("error");
    }
  };

  // --- Step 2: Start Recording ---
  const startRecording = async () => {
    try {
      // Requesting microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        // Turn off the microphone tracks immediately
        stream.getTracks().forEach(track => track.stop());
        sendToSTT(audioBlob);
      };

      mediaRecorder.start();
      setStatus("recording");
    } catch (err) {
      console.error("Microphone Error:", err);
      alert("Microphone access denied. Please click the lock icon in your URL bar and allow Microphone.");
      setStatus("connected");
    }
  };

  // --- Step 3: Stop Recording ---
  const stopRecording = () => {
    if (mediaRecorderRef.current && status === "recording") {
      mediaRecorderRef.current.stop();
      setStatus("processing");
    }
  };

  // --- Step 4: Send to FastAPI (/stt) ---
  const sendToSTT = async (blob: Blob) => {
    const formData = new FormData();
    formData.append("audio", blob, "recording.wav");

    try {
      const response = await fetch("http://localhost:5007/stt", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Server error");

      const data = await response.json();
      setTranscription(data.text);
      setStatus("connected");
    } catch (err) {
      console.error("Transcription Error:", err);
      setStatus("error");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Conversational AI</h1>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className={`w-3 h-3 rounded-full ${status === "connected" || status === "recording" || status === "processing" ? "bg-green-500" : "bg-red-500"}`}></div>
          <p className="text-slate-500 text-sm">
            {status === "error" ? "Service Offline" : "Service Online"}
          </p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md flex flex-col items-center gap-6 border border-slate-200">
        {status === "idle" || status === "error" ? (
          <button 
            onClick={handleConnect} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl font-bold w-full transition-all shadow-lg active:scale-95"
          >
            Connect to Server
          </button>
        ) : (
          <>
            <div className="text-center p-6 bg-slate-50 rounded-xl w-full min-h-[120px] flex items-center justify-center border border-slate-100">
              <p className="text-slate-800 text-lg leading-relaxed">
                {status === "recording" ? (
                  <span className="text-red-500 font-medium animate-pulse">● Listening...</span>
                ) : status === "processing" ? (
                  <span className="text-blue-500">Transcribing voice...</span>
                ) : (
                  transcription || "Hold the button below and speak."
                )}
              </p>
            </div>

            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording} // For mobile compatibility
              onTouchEnd={stopRecording}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl relative ${
                status === "recording" 
                ? "bg-red-500 scale-110" 
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              }`}
            >
              <div className={`absolute inset-0 rounded-full bg-red-400 animate-ping opacity-20 ${status !== "recording" && "hidden"}`}></div>
              <span className="text-white font-bold pointer-events-none">
                {status === "recording" ? "Stop" : "Talk"}
              </span>
            </button>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Hold to Speak</p>
          </>
        )}
      </div>
    </main>
  );
}