"use client";
import { useEffect, useRef, useState, useCallback } from 'react';

interface AudioMessage {
    type: 'stt_final' | 'backend_response' | 'transcription' | 'audio' | 'audio_end' | 'tts_start' | 'tts_interrupted' | 'error';
    text?: string;
    data?: string;
    emotion?: string;
    telemetry?: any;
    actions?: string[];
    message?: string;
}

interface UseWebSocketAudioOptions {
    wsUrl?: string;
    onTranscription?: (text: string) => void;
    onBackendResponse?: (text: string, emotion: string, telemetry: any, actions: string[]) => void;
    onAudioChunk?: (data: string) => void;
    onAudioEnd?: () => void;
    onTtsStart?: (emotion: string, text: string) => void;
    onTtsInterrupted?: () => void;
    onSimulationStart?: () => void; // NEW
    onError?: (error: Error) => void;
}

export const useWebSocketAudio = (options: UseWebSocketAudioOptions = {}) => {
    const {
        wsUrl = 'ws://localhost:5007/ws',
        onTranscription,
        onBackendResponse,
        onTtsStart,
        onTtsInterrupted,
        onSimulationStart, // NEW
        onError,
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Audio Queue System
    const audioQueueRef = useRef<Array<{ buffer: AudioBuffer }>>([]);
    const isPlayingRef = useRef(false);
    // Track the active source so we can kill it immediately on interruption
    const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);

    // Residue buffer for odd byte chunks to maintain 16-bit alignment
    const residueRef = useRef<Uint8Array | null>(null);

    const [isConnected, setIsConnected] = useState(false);
    const [isCallActive, setIsCallActive] = useState(false); // Call logic + Mic Active
    const [greetingInProgress, setGreetingInProgress] = useState(false); // NEW

    // Ref for greeting state to access inside processing loops/callbacks without stale closures
    const greetingInProgressRef = useRef(false);

    // Helper: Update both state and ref
    const setGreetingState = (active: boolean) => {
        setGreetingInProgress(active);
        greetingInProgressRef.current = active;
    };

    // ================== AUDIO PLAYBACK LOGIC ==================
    // (Deprecated sequential queue in favor of scheduled streaming)

    const queueAudioChunk = useCallback(async (base64Data: string) => {
        if (!audioContextRef.current) {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContext({ sampleRate: 16000 });
        }

        try {
            const binaryString = window.atob(base64Data);
            const rawBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                rawBytes[i] = binaryString.charCodeAt(i);
            }

            // Combine with residue from previous chunk
            let combinedBytes: Uint8Array;
            if (residueRef.current) {
                combinedBytes = new Uint8Array(residueRef.current.length + rawBytes.length);
                combinedBytes.set(residueRef.current);
                combinedBytes.set(rawBytes, residueRef.current.length);
                residueRef.current = null;
            } else {
                combinedBytes = rawBytes;
            }

            // If length is odd, save the last byte for the next chunk
            if (combinedBytes.length % 2 !== 0) {
                residueRef.current = combinedBytes.slice(-1);
                combinedBytes = combinedBytes.slice(0, -1);
            }

            if (combinedBytes.length === 0) return;

            // --- RAW PCM (Int16) Interpretation ---
            // ElevenLabs pcm_16000 is 16-bit signed integer
            const int16Data = new Int16Array(combinedBytes.buffer, combinedBytes.byteOffset, combinedBytes.length / 2);
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
            }

            const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 16000);
            buffer.getChannelData(0).set(float32Data);

            // --- Gapless Scheduling ---
            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);

            // Calculate start time: either immediately (plus small buffer) or exactly after previous chunk
            const now = audioContextRef.current.currentTime;
            const startTime = Math.max(now + 0.05, nextStartTimeRef.current);

            source.start(startTime);
            nextStartTimeRef.current = startTime + buffer.duration;
            activeSourceRef.current = source;

        } catch (e) {
            console.error("Audio Queue Error:", e);
        }
    }, []);

    const stopPlayback = useCallback(() => {
        // Reset scheduling
        nextStartTimeRef.current = 0;
        // 1. Immediately stop the currently playing source
        if (activeSourceRef.current) {
            try {
                activeSourceRef.current.stop();
                activeSourceRef.current.disconnect(); // Disconnect to ensure silence
            } catch (e) {
                console.warn("Stop playback warning:", e);
            }
            activeSourceRef.current = null;
        }

        // 2. Clear the pending queue
        audioQueueRef.current = [];
        isPlayingRef.current = false;
    }, []);

    // ================== MICROPHONE SETUP ==================
    const startMicrophone = useCallback(async (startMuted: boolean = false) => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            } else if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            console.log(`🎙️ Starting Microphone... (Muted: ${startMuted})`);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });
            streamRef.current = stream;

            // Set initial mute state on the tracks
            if (startMuted) {
                stream.getAudioTracks().forEach(track => {
                    track.enabled = false;
                });
                setIsMuted(true);
            } else {
                setIsMuted(false);
            }

            const source = audioContextRef.current.createMediaStreamSource(stream);
            const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;

                // Block audio transmission if we are waiting for greeting completion OR manually muted
                if (greetingInProgressRef.current) return;

                // Track enabled check is safer for actual transmission
                if (streamRef.current && !streamRef.current.getAudioTracks()[0]?.enabled) return;

                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32 to Int16 for backend
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                wsRef.current.send(int16Data.buffer);
            };

            source.connect(processor);
            processor.connect(audioContextRef.current.destination);

            setIsCallActive(true);
            console.log("📞 Microphone Active & Streaming");

        } catch (err) {
            console.error("Microphone Error:", err);
            setIsCallActive(false);
            if (onError && err instanceof Error) onError(err);
        }
    }, [onError]);

    // ================== WEBSOCKET LOGIC ==================
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        console.log(`🔌 Connecting to ${wsUrl}...`);
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            console.log('✅ WebSocket connected');
            setIsConnected(true);
        };

        wsRef.current.onclose = () => {
            console.log('🔌 WebSocket disconnected');
            setIsConnected(false);
            setIsCallActive(false);
        };

        wsRef.current.onerror = (error) => {
            console.error('WebSocket Error:', error);
            setIsConnected(false);
            if (onError) onError(new Error('WebSocket connection failed'));
        };

        wsRef.current.onmessage = (event) => {
            try {
                const message: any = JSON.parse(event.data);

                switch (message.type) {
                    case 'simulation_started': // NEW
                        console.log("🚀 Simulation Started Event Received via Audio Socket");
                        if (onSimulationStart) onSimulationStart();
                        break;

                    case 'stt_final':
                    case 'transcription':
                        if (message.text && onTranscription) onTranscription(message.text);
                        break;

                    case 'backend_response':
                        if (onBackendResponse && message.text) {
                            onBackendResponse(
                                message.text,
                                message.emotion || 'neutral',
                                message.telemetry || {},
                                message.actions || []
                            );
                        }
                        break;

                    case 'tts_start':
                        // If a new TTS starts, ensure any old audio is cleared
                        stopPlayback();
                        if (onTtsStart && message.text) onTtsStart(message.emotion || 'neutral', message.text);
                        break;

                    case 'audio':
                        if (message.data) queueAudioChunk(message.data);
                        break;

                    case 'audio_end':
                        console.log("✅ Audio playback ended");

                        // Greeting Flow Check:
                        if (greetingInProgressRef.current) {
                            console.log("📢 Greeting complete. Unmuting microphone now.");
                            setGreetingState(false);

                            // Auto-unmute
                            if (streamRef.current) {
                                streamRef.current.getAudioTracks().forEach(track => {
                                    track.enabled = true;
                                });
                                setIsMuted(false);
                                console.log("🔓 Microphone Unmuted");
                            }
                        }

                        if (options.onAudioEnd) options.onAudioEnd();
                        break;

                    case 'tts_interrupted':
                        console.log("⚡ Barge-in detected (Client)! Stopping playback.");
                        stopPlayback();
                        if (onTtsInterrupted) onTtsInterrupted();
                        break;

                    case 'error':
                        console.error("Server Error:", message.message);
                        if (onError && message.message) onError(new Error(message.message));
                        break;
                }
            } catch (e) {
                console.error("WS Parse Error:", e);
            }
        };
    }, [wsUrl, onTranscription, onBackendResponse, onTtsStart, onTtsInterrupted, onSimulationStart, onError, queueAudioChunk, stopPlayback, options, startMicrophone]);

    const disconnect = useCallback(() => {
        stopCall();
        wsRef.current?.close();
        wsRef.current = null;
        setIsConnected(false);
    }, []); // stopCall is dependent, but we define it below

    const [isMuted, setIsMuted] = useState(false);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const newState = !prev;
            if (streamRef.current) {
                streamRef.current.getAudioTracks().forEach(track => {
                    track.enabled = !newState;
                });
            }
            return newState;
        });
    }, []);

    const stopCall = useCallback(() => {
        console.log("☎️ Ending Call");

        // Notify backend of session end
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "session_end" }));
        }

        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        // Clear any audio currently playing
        stopPlayback();
        setIsCallActive(false);
        setGreetingState(false); // Reset greeting state
        setIsMuted(false); // Reset mute state
    }, [stopPlayback]);

    // Call start trigger
    const startCall = useCallback(async (sessionId?: string) => {
        if (isCallActive || greetingInProgress) return;

        // Propagate Session ID to Backend
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            if (sessionId) {
                console.log(`🆔 Configured Session: ${sessionId}`);
                wsRef.current.send(JSON.stringify({
                    type: "session_config",
                    sessionId: sessionId
                }));
            }

            // Start Greeting Flow
            // Initializing microphone IMMEDIATELY but MUTED to maintain "call" state persistence
            console.log("⏳ Starting Call: Starting muted microphone, waiting for AI Greeting...");
            setGreetingState(true);
            await startMicrophone(true); // START MUTED
        }
    }, [isCallActive, greetingInProgress, startMicrophone]);


    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCall();
            wsRef.current?.close();
        };
    }, []);

    return {
        isConnected,
        isCallActive,
        greetingInProgress, // EXPOSE THIS
        isMuted,
        connect,
        disconnect,
        startCall,
        stopCall,
        toggleMute
    };
};