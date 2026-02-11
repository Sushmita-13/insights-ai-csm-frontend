"use client";

import React, { useRef, useEffect } from 'react';

interface VoiceAssistantProps {
    isConnected: boolean;
    isCallActive: boolean;
    serverStatus: string;
    transcript: string;
    onStartCall: () => void;
    onEndCall: () => void;
    isMuted?: boolean;
    onToggleMute?: () => void;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
    isConnected,
    isCallActive,
    serverStatus, // e.g., "Listening", "Speaking", "Processing"
    transcript,
    onStartCall,
    onEndCall,
    isMuted = false,
    onToggleMute
}) => {

    // Auto-scroll transcript
    const transcriptRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }, [transcript]);

    const getStatusColor = () => {
        if (!isConnected) return "border-red-500 bg-red-100";
        if (isMuted) return "border-slate-400 bg-slate-100"; // Muted state visual
        if (!isCallActive) return "border-blue-300 bg-blue-50";
        switch (serverStatus) {
            case "Listening": return "border-green-400 bg-green-50";
            case "Speaking": return "border-purple-400 bg-purple-50";
            case "Thinking": return "border-yellow-400 bg-yellow-50";
            default: return "border-slate-300 bg-white";
        }
    };

    const getOrbAnimation = () => {
        if (isMuted) return ""; // No animation when muted
        if (serverStatus === "Speaking") return "animate-speaking-pulse"; // Need to define custom or use existing
        if (serverStatus === "Listening") return "animate-pulse";
        if (serverStatus === "Thinking") return "animate-bounce";
        return "";
    };

    return (
        <div className={`relative w-full max-w-md mx-auto p-6 rounded-3xl shadow-2xl transition-all duration-500 border-2 ${getStatusColor()}`}>

            {/* --- Status Header --- */}
            <div className="absolute top-4 left-0 right-0 text-center">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-white/80 backdrop-blur shadow-sm text-slate-600">
                    {isConnected ? (isCallActive ? "" : "Ready to Call") : "Connecting..."}
                </span>
            </div>

            {/* --- Central Orb --- */}
            <div className="flex justify-center items-center my-12 h-48">
                <div className="relative">
                    {/* Outer Rings */}
                    {isCallActive && !isMuted && (
                        <>
                            <div className={`absolute inset-0 rounded-full border-4 border-current opacity-20 scale-150 ${serverStatus === 'Listening' ? 'text-green-500 animate-ping' : 'text-purple-500'}`}></div>
                            <div className={`absolute inset-0 rounded-full border-2 border-current opacity-40 scale-125 ${serverStatus === 'Listening' ? 'text-green-500' : 'text-purple-500 animate-pulse'}`}></div>
                        </>
                    )}

                    {/* Core Orb */}
                    <div className={`w-32 h-32 rounded-full shadow-inner flex items-center justify-center text-4xl shadow-xl transition-all duration-300 z-10 relative overflow-hidden
                        ${!isConnected ? 'bg-gray-300 text-gray-500' :
                            isMuted ? 'bg-slate-400 text-white' :
                                !isCallActive ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white cursor-pointer hover:scale-105' :
                                    serverStatus === 'Listening' ? 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-green-200' :
                                        serverStatus === 'Speaking' ? 'bg-gradient-to-br from-purple-400 to-purple-600 text-white shadow-purple-200' :
                                            'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white'
                        }
                    `}>
                        {/* Icon Switcher */}
                        <span className={getOrbAnimation()}>
                            {!isConnected ? "🔌" :
                                isMuted ? "😶" :
                                    !isCallActive ? "📞" :
                                        serverStatus === "Listening" ? "👂" :
                                            serverStatus === "Speaking" ? "🗣️" :
                                                "🧠"}
                        </span>

                        {/* Inner detail/shine */}
                        <div className="absolute top-2 left-4 w-8 h-4 bg-white opacity-20 rounded-full rotate-[-45deg]"></div>
                    </div>
                </div>
            </div>

            {/* --- Transcript Area --- */}
            <div
                ref={transcriptRef}
                className="h-32 mb-6 overflow-y-auto bg-white/60 backdrop-blur-sm rounded-xl p-4 text-center text-sm font-medium text-slate-700 shadow-inner border border-white/50"
            >
                {transcript || (isCallActive ? "" : "Start a call to begin conversation.")}
            </div>

            {/* --- Controls --- */}
            <div className="flex justify-center gap-4 items-center">

                {/* Mute Button (Only visible when active) */}
                {isCallActive && (
                    <button
                        onClick={onToggleMute}
                        className={`p-3 rounded-full transition-all active:scale-95 shadow-md ${isMuted ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        title={isMuted ? "Unmute" : "Mute"}
                    >
                        {isMuted ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 5.25c.88 0 1.704.507 1.938 1.354.21.763.322 1.566.322 2.396 0 .83-.112 1.633-.322 2.396-.234.847-1.058 1.354-1.938 1.354" opacity="0.4" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                            </svg>
                        )}
                    </button>
                )}

                {!isCallActive ? (
                    <button
                        onClick={onStartCall}
                        disabled={!isConnected}
                        className="btn-call bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-110 active:scale-95"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                        </svg>
                    </button>
                ) : (
                    <button
                        onClick={onEndCall}
                        className="btn-hangup bg-red-500 hover:bg-red-600 text-white p-4 rounded-full shadow-lg shadow-red-200 transition-all hover:scale-110 active:scale-95 animate-bounce-short"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 3.001c-.78-.71-1.89-1.13-3.116-1.13C5.978 1.87 0 7.85 0 14.498c0 1.94.522 3.754 1.43 5.34.183.319.467.557.8.67l2.128.728c.453.155.947-.07 1.142-.518l.896-2.043a1.05 1.05 0 00-.23-1.168l-.89-.89a14.545 14.545 0 01-2.095-8.125c0-5.753 4.887-10.43 10.87-10.43 1.226 0 2.336.42 3.116 1.13l.001-.001zm1.5-1.5l3.75 3.75-3.75 3.75M21 5.25H9.75" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

        </div>
    );
};
