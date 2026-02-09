"use client";

import { useState, useRef, useEffect } from "react";
import { useWebSocketAudio } from "@/lib/useWebSocketAudio";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  telemetry?: any;
  actions?: string[];
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
    wsUrl: 'ws://localhost:5007/ws',

    onTranscription: (text) => {
      console.log("📝 Transcription received:", text);
      setMessages(prev => [...prev, { role: 'user', content: text }]);
    },

    onBackendResponse: (text, emotion, telemetry, actions) => {
      console.log("🤖 Backend response:", { text, emotion, telemetry, actions });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: text,
        emotion,
        telemetry,
        actions
      }]);
    },

    onTtsStart: (emotion, text) => {
      console.log("🗣️ TTS Started:", emotion);
      setStatus("speaking");
    },

    onAudioChunk: async (base64Data) => {
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
        console.error("❌ Audio Decode Error", e);
      }
    },

    onAudioEnd: () => {
      console.log("✅ Audio Playback Ended");
      setStatus("connected");
    },

    onError: (err) => {
      console.error("❌ Hook Error:", err);
      alert("Connection Error: Check console logs.");
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

  // Wrapper handlers for logging
  const handleStart = (e: any) => {
    e.preventDefault(); // Prevent ghost clicks
    console.log(`🖱️ Event: ${e.type} triggered`);
    if (!isRecording) startRecording();
  };

  const handleStop = (e: any) => {
    e.preventDefault();
    console.log(`🖱️ Event: ${e.type} triggered`);
    //if (isRecording) 
    stopRecording();
  };

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

              {/* Display telemetry data for assistant messages */}
              {msg.role === 'assistant' && msg.telemetry && (
                <div className="mt-2 pt-2 border-t border-slate-300 text-xs space-y-0.5">
                  <div className="font-semibold opacity-70">System Status:</div>
                  <div className="opacity-60">
                    Pressure: {msg.telemetry.pressure} bar | Frequency: {msg.telemetry.frequency} Hz
                  </div>
                  <div className="opacity-60">
                    Load: {msg.telemetry.load} MW | Mode: {msg.telemetry.scenario_mode}
                  </div>
                </div>
              )}

              {/* Display actions executed */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-300 text-xs">
                  <span className="font-semibold opacity-70">Actions: </span>
                  <span className="opacity-60">{msg.actions.join(', ')}</span>
                </div>
              )}
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
          onMouseDown={handleStart}
          onMouseUp={handleStop}
          onMouseLeave={handleStop} // IMPORTANT: Fixes "stuck" state if dragging outside
          onTouchStart={handleStart}
          onTouchEnd={handleStop}
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