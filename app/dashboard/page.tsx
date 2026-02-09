"use client";

import { useState, useRef, useEffect } from "react";
import { useWebSocketAudio } from "@/lib/useWebSocketAudio";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
}

export default function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<"idle" | "connected" | "recording" | "speaking">("idle");
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize the WebSocket Hook
  const {
    isConnected,
    isRecording,
    connect,
    startRecording,
    stopRecording
  } = useWebSocketAudio({
    wsUrl: 'ws://localhost:5007/ws', // Backend WebSocket URL

    onTranscription: (text) => {
      // Add User Message
      setMessages(prev => [...prev, { role: 'user', content: text }]);
    },

    onTtsStart: (emotion, text) => {
      // Add Assistant Message & Update Status
      setMessages(prev => [...prev, { role: 'assistant', content: text, emotion }]);
      setStatus("speaking");
    },

    onAudioChunk: async (base64Data) => {
      // Audio Playback Logic
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      try {
        const binaryString = window.atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const buffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
      } catch (e) {
        console.error("Audio Decode Error", e);
      }
    },

    onAudioEnd: () => {
      setStatus("connected");
    },

    onError: (err) => {
      console.error(err);
      alert("Connection Error: Ensure backend is running on port 5008");
    }
  });

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, []);

  // Sync internal status with hook status
  useEffect(() => {
    if (isRecording) setStatus("recording");
    else if (isConnected && status !== "speaking") setStatus("connected");
    else if (!isConnected) setStatus("idle");
  }, [isRecording, isConnected]);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center p-6 gap-6">

      {/* Header */}
      <div className="text-center mt-10">
        <h1 className="text-3xl font-bold text-slate-900">Conversational AI</h1>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}></div>
          <p className="text-slate-500 text-sm">
            {isConnected ? "System Online" : "Connecting..."}
          </p>
        </div>
      </div>

      {/* Chat History Display */}
      <div className="flex-1 w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-y-auto mb-4 min-h-[400px] flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-slate-400 italic">
            Start the conversation by holding the button below...
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-xl text-sm ${msg.role === 'user'
              ? 'bg-blue-600 text-white rounded-br-none'
              : 'bg-slate-100 text-slate-800 rounded-bl-none'
              }`}>
              <p>{msg.content}</p>
              {msg.emotion && <span className="text-xs opacity-50 mt-1 block capitalize">Mood: {msg.emotion}</span>}
            </div>
          </div>
        ))}

        {/* Status Indicators */}
        {status === "speaking" && (
          <div className="text-xs text-slate-400 animate-pulse ml-2">AI is speaking...</div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full max-w-md flex flex-col items-center gap-4">
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          disabled={!isConnected}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl relative ${status === "recording"
            ? "bg-red-500 scale-110 shadow-red-200"
            : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-blue-200"
            } ${!isConnected && "opacity-50 cursor-not-allowed"}`}
        >
          {status === "recording" && (
            <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-20"></div>
          )}
          <span className="text-white font-bold text-lg pointer-events-none">
            {status === "recording" ? "Stop" : "Talk"}
          </span>
        </button>
        <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Hold to Speak</p>
      </div>
    </main>
  );
}