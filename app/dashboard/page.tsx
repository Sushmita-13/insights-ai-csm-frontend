"use client";

import { useState, useEffect } from "react";
import { useWebSocketAudio } from "@/lib/useWebSocketAudio";
import { VoiceAssistant } from "@/components/VoiceAssistant";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  telemetry?: any;
  actions?: string[];
}

export default function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  // 'idle' | 'connected' | 'listening' | 'speaking' | 'processing'
  const [assistantState, setAssistantState] = useState<string>("Listening");
  const [currentTranscript, setCurrentTranscript] = useState("");

  const {
    isConnected,
    isCallActive,
    connect,
    startCall,
    stopCall
  } = useWebSocketAudio({
    wsUrl: 'ws://localhost:5007/ws',

    onTranscription: (text) => {
      console.log("📝 User:", text);
      setCurrentTranscript(text);
      setAssistantState("Thinking"); // User finished speaking (stt_final)
    },

    onBackendResponse: (text, emotion, telemetry, actions) => {
      console.log("🤖 AI:", text);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: text,
        emotion,
        telemetry,
        actions
      }]);
      // Note: We don't set 'Speaking' here, we wait for 'tts_start' or audio chunks
    },

    onTtsStart: (emotion, text) => {
      console.log("🗣️ TTS Start");
      setAssistantState("Speaking");
      setCurrentTranscript(text);
    },

    // Fallback if no TTS start event (e.g. direct audio stream)
    onAudioChunk: () => {
      if (assistantState !== "Speaking") setAssistantState("Speaking");
    },

    onAudioEnd: () => {
      console.log("✅ Audio End");
      setAssistantState("Listening"); // Go back to listening after speaking
      setCurrentTranscript("");
    },

    onTtsInterrupted: () => {
      console.log("⚡ Interrupted");
      setAssistantState("Listening");
      setCurrentTranscript("");
    },

    onError: (err) => {
      console.error("❌ Error:", err);
      // Optional: Show toast
    }
  });

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, []);

  // Sync state when call starts/stops
  useEffect(() => {
    if (!isCallActive) {
      setAssistantState("Idle");
      setCurrentTranscript("");
    } else {
      setAssistantState("Listening");
    }
  }, [isCallActive]);


  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center p-6 gap-6">

      {/* Header */}
      <div className="text-center mt-10 mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Conversational AI</h1>
        <p className="text-slate-500 text-sm mt-2">Voice-Enabled Power Plant Assistant</p>
      </div>

      {/* Voice Assistant Unit */}
      <VoiceAssistant
        isConnected={isConnected}
        isCallActive={isCallActive}
        serverStatus={assistantState}
        transcript={currentTranscript}
        onStartCall={startCall}
        onEndCall={stopCall}
      />

      {/* Structured Data Logs (Optional view) */}
      <div className="w-full max-w-2xl mt-8 border-t border-slate-200 pt-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Recent Actions & Telemetry</h3>
        <div className="space-y-3 opacity-80">
          {messages.slice(-3).map((msg, i) => (
            msg.telemetry && (
              <div key={i} className="bg-white p-3 rounded-lg border border-slate-200 text-xs shadow-sm flex justify-between">
                <div>
                  <span className="font-bold text-blue-600">STATE: </span>
                  {msg.telemetry.status} | Load: {msg.telemetry.load}MW
                </div>
                <div className="text-slate-500">
                  {new Date().toLocaleTimeString()}
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </main>
  );
}