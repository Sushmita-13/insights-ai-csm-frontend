"use client";

import React, { useRef, useEffect } from 'react';
import { ChatMessage } from '../lib/useWebSocketAudio';

interface VoiceAssistantProps {
    isConnected: boolean;
    isConnecting?: boolean; // ⚡ NEW PROP
    isCallActive: boolean;
    serverStatus: string;
    messages: ChatMessage[];
    onStartCall: () => void;
    onEndCall: () => void;
    isMuted?: boolean;
    onToggleMute?: () => void;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
    isConnected,
    isConnecting = false, // Default false
    isCallActive,
    serverStatus,
    messages = [],
    onStartCall,
    onEndCall,
    isMuted = false,
    onToggleMute
}) => {

    const transcriptRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom whenever messages change
    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }, [messages, serverStatus]);

    const getStatusColor = () => {
        if (isConnecting) return "border-blue-300 bg-blue-50"; // ⚡ Connecting Color
        if (isMuted) return "border-slate-400 bg-slate-100";
        if (!isCallActive) return "border-slate-200 bg-white";
        switch (serverStatus) {
            case "Listening": return "border-green-400 bg-green-50";
            case "Speaking": return "border-purple-400 bg-purple-50";
            case "Thinking": return "border-yellow-400 bg-yellow-50";
            default: return "border-slate-300 bg-white";
        }
    };

    const getOrbAnimation = () => {
        if (isConnecting) return "animate-spin"; // ⚡ Connecting Animation
        if (isMuted) return "";
        if (serverStatus === "Speaking") return "animate-pulse";
        if (serverStatus === "Listening") return "animate-pulse";
        if (serverStatus === "Thinking") return "animate-bounce";
        return "";
    };

    const getStatusText = () => {
        if (isConnecting) return "Initializing Pipeline...";
        if (isCallActive) return isConnected ? "Live Session" : "Reconnecting...";
        return "Ready to Connect";
    };

    return (
        <div className={`relative w-full max-w-md mx-auto p-6 rounded-3xl shadow-2xl transition-all duration-500 border-2 ${getStatusColor()}`}>

            {/* --- Status Header --- */}
            <div className="absolute top-4 left-0 right-0 text-center">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-white/80 backdrop-blur shadow-sm text-slate-600`}>
                    {getStatusText()}
                </span>
            </div>

            {/* --- Central Orb --- */}
            <div className="flex justify-center items-center my-8 h-40">
                <div className="relative">
                    {/* Pulsing rings only when active and not connecting */}
                    {isCallActive && !isMuted && isConnected && !isConnecting && (
                        <>
                            <div className={`absolute inset-0 rounded-full border-4 border-current opacity-20 scale-150 ${serverStatus === 'Listening' ? 'text-green-500 animate-ping' : 'text-purple-500'}`}></div>
                            <div className={`absolute inset-0 rounded-full border-2 border-current opacity-40 scale-125 ${serverStatus === 'Listening' ? 'text-green-500' : 'text-purple-500 animate-pulse'}`}></div>
                        </>
                    )}

                    <div className={`w-32 h-32 rounded-full shadow-inner flex items-center justify-center text-4xl shadow-xl transition-all duration-300 z-10 relative overflow-hidden
                        ${isConnecting ? 'bg-gradient-to-br from-blue-300 to-blue-500 text-white' : // ⚡ Connecting Style
                            !isCallActive ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white cursor-pointer hover:scale-105' :
                                !isConnected ? 'bg-gray-300 text-gray-500' :
                                    isMuted ? 'bg-slate-400 text-white' :
                                        serverStatus === 'Listening' ? 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-green-200' :
                                            serverStatus === 'Speaking' ? 'bg-gradient-to-br from-purple-400 to-purple-600 text-white shadow-purple-200' :
                                                'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white'
                        }
                    `}>
                        <span className={getOrbAnimation()}>
                            {isConnecting ? "⏳" : // ⚡ Connecting Icon
                                !isCallActive ? "🎙️" : !isConnected ? "🔌" : isMuted ? "🔇" : serverStatus === "Listening" ? "👂" : serverStatus === "Speaking" ? "🗣️" : "🤔"}
                        </span>
                    </div>
                </div>
            </div>

            {/* --- Chat Transcript Area --- */}
            <div
                ref={transcriptRef}
                className="h-64 mb-6 overflow-y-auto bg-white/60 backdrop-blur-sm rounded-xl p-4 shadow-inner border border-white/50 flex flex-col gap-3"
            >
                {messages.length === 0 && !isCallActive && !isConnecting && (
                    <div className="text-center text-slate-400 mt-20 text-sm">Click the green button to start.</div>
                )}

                {isConnecting && messages.length === 0 && (
                    <div className="text-center text-slate-400 mt-20 text-sm animate-pulse">Establishing secure connection...</div>
                )}

                {messages.map((msg, index) => (
                    <div key={index} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user'
                            ? 'bg-blue-500 text-white rounded-br-none'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                            }`}>
                            <p className="font-medium text-xs opacity-75 mb-1">{msg.role === 'user' ? 'You' : 'Sentinel'}</p>
                            {msg.text}
                        </div>
                    </div>
                ))}

                {/* Thinking Indicator Bubble */}
                {serverStatus === "Thinking" && (
                    <div className="flex justify-start">
                        <div className="bg-white/80 border border-yellow-200 text-slate-500 p-2 rounded-2xl rounded-bl-none text-xs italic flex gap-1 items-center">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span>
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Controls --- */}
            <div className="flex justify-center gap-4 items-center">
                {isCallActive ? (
                    <>
                        <button
                            onClick={onToggleMute}
                            className={`p-3 rounded-full transition-all active:scale-95 shadow-md ${isMuted ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}
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

                        <button onClick={onEndCall} className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-full shadow-lg shadow-red-200 transition-all hover:scale-110 active:scale-95">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 3.001c-.78-.71-1.89-1.13-3.116-1.13C5.978 1.87 0 7.85 0 14.498c0 1.94.522 3.754 1.43 5.34.183.319.467.557.8.67l2.128.728c.453.155.947-.07 1.142-.518l.896-2.043a1.05 1.05 0 00-.23-1.168l-.89-.89a14.545 14.545 0 01-2.095-8.125c0-5.753 4.887-10.43 10.87-10.43 1.226 0 2.336.42 3.116 1.13l.001-.001zm1.5-1.5l3.75 3.75-3.75 3.75M21 5.25H9.75" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </>
                ) : (
                    <button
                        onClick={onStartCall}
                        disabled={isConnecting} // ⚡ Disable when connecting
                        className={`${isConnecting ? 'bg-slate-300 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white p-4 rounded-full shadow-lg shadow-green-200 transition-all hover:scale-110 active:scale-95`}
                    >
                        {isConnecting ? (
                            // ⚡ Loading Spinner
                            <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                            </svg>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};