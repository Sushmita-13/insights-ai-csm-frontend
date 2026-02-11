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
  // 'Idle' | 'Connected' | 'Listening' | 'Speaking' | 'Processing' | 'Waiting for AI...'
  const [assistantState, setAssistantState] = useState<string>("Idle");
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [simulationActive, setSimulationActive] = useState(false); // NEW: Simulation State

  const {
    isConnected,
    isCallActive,
    connect,
    startCall,
    stopCall,
    isMuted,
    toggleMute,
    greetingInProgress // Exposed from hook
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
    },

    onTtsStart: (emotion, text) => {
      console.log("🗣️ TTS Start");
      setAssistantState("Speaking");
      setCurrentTranscript(text);
    },

    // Fallback if no TTS start event
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

    onSimulationStart: () => { // NEW
      console.log("🚀 Simulation Started (Dashboard Update)");
      setSimulationActive(true);
    },

    onError: (err) => {
      console.error("❌ Error:", err);
    }
  });

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, []);

  // Sync state when call starts/stops
  useEffect(() => {
    if (!isCallActive && !greetingInProgress) {
      setAssistantState("Idle");
      setCurrentTranscript("");
    } else if (isCallActive && !greetingInProgress) {
      // Normal state
      // setAssistantState("Listening"); // Handled by onAudioEnd usually
    }
  }, [isCallActive, greetingInProgress]);

  const handleStartCall = () => {
    const sessionId = crypto.randomUUID();
    console.log("Starting Call with Session ID:", sessionId);
    setAssistantState("Thinking"); // Started Thinking immediately
    startCall(sessionId);
  };

  return (
    <main className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden text-slate-100">

      {/* Header - Compact */}
      <header className="flex-none p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur border-b border-slate-800 h-16">
        <div>
          <h1 className="text-xl font-bold text-white leading-none">InsightsAI Plant Monitor</h1>
          <p className="text-slate-400 text-xs text-opacity-80">Real-time Digital Twin & Voice Assistant</p>
        </div>
        {/* You could add status indicators here if needed */}
      </header>

      {/* Main Content - Flex Row for Desktop */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Left Panel: Voice Assistant (Fixed Width on large screens) */}
        <div className="flex-none lg:w-[400px] bg-slate-900/30 p-4 border-b lg:border-b-0 lg:border-r border-slate-800 overflow-y-auto custom-scrollbar">
          <div className="h-full flex flex-col justify-center">
            <VoiceAssistant
              isConnected={isConnected}
              isCallActive={isCallActive || greetingInProgress} // Ensure UI shows active during greeting
              serverStatus={assistantState}
              transcript={currentTranscript}
              onStartCall={handleStartCall}
              onEndCall={stopCall}
              isMuted={isMuted}
              onToggleMute={toggleMute}
            />
          </div>
        </div>

        {/* Right Panel: Simulation Dashboard (Takes remaining space) */}
        <div className="flex-1 p-4 bg-slate-950/50 overflow-hidden relative">
          <div className="h-full w-full">
            <PlantDashboard simulationActive={simulationActive} />
          </div>
        </div>

      </div>

    </main>
  );
}
