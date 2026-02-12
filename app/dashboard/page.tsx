"use client";
import { useState, useEffect } from "react";
import { useWebSocketAudio } from "@/lib/useWebSocketAudio";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { PlantDashboard } from "@/components/plant/plant-dashboard";

export default function DashboardPage() {
  // 'Idle' | 'Connected' | 'Listening' | 'Speaking' | 'Processing' | 'Waiting for AI...'
  const [assistantState, setAssistantState] = useState<string>("Idle");
  const [simulationActive, setSimulationActive] = useState(false);

  const {
    isConnected,
    isCallActive,
    connect,
    startCall,
    stopCall,
    isMuted,
    toggleMute,
    greetingInProgress,
    messages, // ⚡ Get messages directly from the hook
  } = useWebSocketAudio({
    wsUrl: 'ws://localhost:8000/ws/query',

    onTranscription: (text) => {
      console.log("📝 User:", text);
      // setAssistantState("Thinking") is handled by onThinking
    },

    onBackendResponse: (text, emotion, telemetry, actions) => {
      console.log("🤖 AI:", text);

      // Check actions for simulation start
      if (actions?.includes("Started Plant Simulation")) {
        console.log("🚀 Simulation Start detected in actions array");
        setSimulationActive(true);
      }
    },

    onTtsStart: (emotion, text) => {
      console.log("🗣️ TTS Start");
    },

    // Fallback if no TTS start event
    onAudioChunk: () => {
      if (assistantState !== "Speaking") setAssistantState("Speaking");
    },

    onAudioEnd: () => {
      console.log("✅ Audio End");
      setAssistantState("Listening");
    },

    onTtsInterrupted: () => {
      console.log("⚡ Interrupted");
      setAssistantState("Listening");
    },

    onThinking: (isThinking) => {
      if (isThinking) setAssistantState("Thinking");
      else if (assistantState === "Thinking") setAssistantState("Listening");
    },

    onSpeaking: (isSpeaking) => {
      if (isSpeaking) setAssistantState("Speaking");
      else if (assistantState === "Speaking") setAssistantState("Listening");
    },

    onSimulationStart: () => {
      console.log("🚀 Simulation Started (Dashboard Update)");
      setSimulationActive(true);
    },

    onError: (err) => {
      console.error("❌ Error:", err);
    }
  });

  // Auto-connect removed to prevent premature connection logic
  // useEffect(() => { connect(); }, []); 

  // Sync state when call starts/stops
  useEffect(() => {
    if (!isCallActive && !greetingInProgress) {
      setAssistantState("Idle");
    }
  }, [isCallActive, greetingInProgress]);

  const handleStartCall = () => {
    const sessionId = crypto.randomUUID();
    console.log("Starting Call with Session ID:", sessionId);
    startCall(sessionId);
  };

  return (
    <main className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden text-slate-100">

      {/* Header */}
      <header className="flex-none p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur border-b border-slate-800 h-16">
        <div>
          <h1 className="text-xl font-bold text-white leading-none">InsightsAI Plant Monitor</h1>
          <p className="text-slate-400 text-xs text-opacity-80">Real-time Digital Twin & Voice Assistant</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Left Panel: Voice Assistant */}
        <div className="flex-none lg:w-[400px] bg-slate-900/30 p-4 border-b lg:border-b-0 lg:border-r border-slate-800 overflow-y-auto custom-scrollbar">
          <div className="h-full flex flex-col justify-center">
            <VoiceAssistant
              isConnected={isConnected}
              isCallActive={isCallActive || greetingInProgress}
              serverStatus={assistantState}
              messages={messages} // ⚡ FIX: Passing the messages array correctly
              onStartCall={handleStartCall}
              onEndCall={stopCall}
              isMuted={isMuted}
              onToggleMute={toggleMute}
            />
          </div>
        </div>

        {/* Right Panel: Simulation Dashboard */}
        <div className="flex-1 p-4 bg-slate-950/50 overflow-hidden relative">
          <div className="h-full w-full">
            <PlantDashboard simulationActive={simulationActive} />
          </div>
        </div>

      </div>

    </main>
  );
}