"use client";
import { useState, useEffect } from "react";
import { useWebSocketAudio } from "@/lib/useWebSocketAudio";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { PlantDashboard } from "@/components/plant/plant-dashboard";

export default function DashboardPage() {
  // 'Idle' | 'Connected' | 'Listening' | 'Speaking' | 'Processing' | 'Waiting for AI...'
  const [assistantState, setAssistantState] = useState<string>("Idle");
  const [simulationActive, setSimulationActive] = useState(false);
  const [evaluationReport, setEvaluationReport] = useState<string | null>(null); // ⚡ NEW: Evaluation Report State

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

    onEvaluationReport: (report) => {
      console.log("📊 Received Evaluation Report");
      setEvaluationReport(report); // Save report text to state
      setSimulationActive(false); // Make sure the simulation view knows it's over
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

  // Sync state when call starts/stops
  useEffect(() => {
    if (!isCallActive && !greetingInProgress) {
      setAssistantState("Idle");
    }
  }, [isCallActive, greetingInProgress]);

  const handleStartCall = () => {
    // Clear old report if starting a new call
    if (evaluationReport) {
      handleRestartSimulation();
    }
    const sessionId = crypto.randomUUID();
    console.log("Starting Call with Session ID:", sessionId);
    startCall(sessionId);
  };

  const handleRestartSimulation = async () => {
    try {
      // ⚡ Try to reset the backend simulation as well
      await fetch('http://localhost:8000/simulation/reset', { method: 'POST' });
    } catch (err) {
      console.error("Failed to reset backend simulation", err);
    }
    setEvaluationReport(null);
    setSimulationActive(false);
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
              messages={messages}
              onStartCall={handleStartCall}
              onEndCall={stopCall}
              isMuted={isMuted}
              onToggleMute={toggleMute}
            />
          </div>
        </div>

        {/* Right Panel: Simulation Dashboard OR Evaluation Report */}
        <div className="flex-1 p-4 bg-slate-950/50 overflow-hidden relative">
          <div className="h-full w-full">
            {evaluationReport ? (
              // ⚡ NEW: Evaluation Report View
              <div className="h-full flex flex-col bg-slate-900 rounded-lg border border-slate-800 p-6 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                  <h2 className="text-2xl font-bold text-white">Simulation Complete</h2>
                  <button
                    onClick={handleRestartSimulation}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded transition-colors text-sm"
                  >
                    Close Report
                  </button>
                </div>

                <div className="text-slate-300 whitespace-pre-wrap text-base leading-relaxed mb-6 font-sans">
                  {evaluationReport}
                </div>
              </div>
            ) : (
              // Standard Simulation View
              <PlantDashboard simulationActive={simulationActive} />
            )}
          </div>
        </div>

      </div>

    </main>
  );
}