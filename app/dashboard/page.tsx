"use client";
import { useState, useEffect } from "react";
import { useWebSocketAudio } from "@/lib/useWebSocketAudio";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { PlantDashboard } from "@/components/plant/plant-dashboard";

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

  const handleStartCall = () => {
    const sessionId = crypto.randomUUID();
    console.log("Starting Call with Session ID:", sessionId);
    startCall(sessionId);
  };

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center p-6 gap-6 text-slate-100">

      {/* Header */}
      <div className="text-center mt-4 mb-2">
        <h1 className="text-3xl font-bold text-white">InsightsAI Plant Monitor</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time Digital Twin & Voice Assistant</p>
      </div>

      {/* Voice Assistant Unit */}
      <div className="w-full max-w-4xl mx-auto mb-8">
        <VoiceAssistant
          isConnected={isConnected}
          isCallActive={isCallActive}
          serverStatus={assistantState}
          transcript={currentTranscript}
          onStartCall={handleStartCall}
          onEndCall={stopCall}
        />
      </div>

      {/* Simulation Dashboard */}
      <div className="w-full">
        <PlantDashboard />
      </div>

    </main>
  );
}
