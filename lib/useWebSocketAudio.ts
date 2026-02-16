"use client";
import { useEffect, useRef, useState, useCallback } from 'react';

// Define Message Structure for Chat History
export interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
    emotion?: string;
}

interface UseWebSocketAudioOptions {
    wsUrl?: string;
    onTranscription?: (text: string) => void;
    onBackendResponse?: (text: string, emotion: string, telemetry: any, actions: string[]) => void;
    onAudioChunk?: (data: string) => void;
    onAudioEnd?: () => void;
    onTtsStart?: (emotion: string, text: string) => void;
    onTtsInterrupted?: () => void;
    onSimulationStart?: () => void;
    onEvaluationReport?: (report: string) => void;
    onThinking?: (isThinking: boolean) => void;
    onSpeaking?: (isSpeaking: boolean) => void;
    onError?: (error: Error) => void;
}

export const useWebSocketAudio = (options: UseWebSocketAudioOptions = {}) => {
    const {
        wsUrl = 'ws://localhost:8000/ws/query',
        onTranscription,
        onBackendResponse,
        onTtsStart,
        onTtsInterrupted,
        onSimulationStart,
        onEvaluationReport,
        onThinking,
        onSpeaking,
        onError,
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Audio Queue System
    const audioQueueRef = useRef<Array<{ buffer: AudioBuffer }>>([]);
    const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const residueRef = useRef<Uint8Array | null>(null);

    // ⚡ Ghost Audio Prevention: Flag to ignore tail packets after interruption
    const ignoreAudioRef = useRef(false);

    // State
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false); // ⚡ NEW: Connection state
    const [isCallActive, setIsCallActive] = useState(false);
    const [greetingInProgress, setGreetingInProgress] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);

    // ⚡ Chat History State
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const greetingInProgressRef = useRef(false);
    const pendingSessionIdRef = useRef<string | null>(null);

    const setGreetingState = (active: boolean) => {
        setGreetingInProgress(active);
        greetingInProgressRef.current = active;
    };

    const addMessage = (role: 'user' | 'assistant', text: string, emotion?: string) => {
        setMessages(prev => [...prev, { role, text, timestamp: Date.now(), emotion }]);
    };

    // ================== AUDIO PLAYBACK LOGIC ==================

    const queueAudioChunk = useCallback(async (base64Data: string) => {
        // ⚡ FIX 2: Drop ghost packets if we are in "interrupted" state
        if (ignoreAudioRef.current) return;

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

            let combinedBytes: Uint8Array;
            if (residueRef.current) {
                combinedBytes = new Uint8Array(residueRef.current.length + rawBytes.length);
                combinedBytes.set(residueRef.current);
                combinedBytes.set(rawBytes, residueRef.current.length);
                residueRef.current = null;
            } else {
                combinedBytes = rawBytes;
            }

            if (combinedBytes.length % 2 !== 0) {
                residueRef.current = combinedBytes.slice(-1);
                combinedBytes = combinedBytes.slice(0, -1);
            }

            if (combinedBytes.length === 0) return;

            const int16Data = new Int16Array(combinedBytes.buffer, combinedBytes.byteOffset, combinedBytes.length / 2);
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
            }

            const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 16000);
            buffer.getChannelData(0).set(float32Data);

            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);

            const now = audioContextRef.current.currentTime;
            const startTime = Math.max(now + 0.02, nextStartTimeRef.current);

            source.start(startTime);
            nextStartTimeRef.current = startTime + buffer.duration;
            activeSourceRef.current = source;

        } catch (e) {
            console.error("Audio Queue Error:", e);
        }
    }, []);

    const stopPlayback = useCallback(() => {
        // ⚡ Stop logic
        nextStartTimeRef.current = 0;
        if (activeSourceRef.current) {
            try {
                activeSourceRef.current.stop();
                activeSourceRef.current.disconnect();
            } catch (e) {
                console.warn("Stop playback warning:", e);
            }
            activeSourceRef.current = null;
        }
        audioQueueRef.current = [];
    }, []);

    // ================== MICROPHONE SETUP & DOWNSAMPLING ==================

    const downsampleBuffer = (buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) => {
        if (outputSampleRate === inputSampleRate) return buffer;
        const sampleRateRatio = inputSampleRate / outputSampleRate;
        const newLength = Math.round(buffer.length / sampleRateRatio);
        const result = new Float32Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            let accum = 0, count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = count > 0 ? accum / count : 0;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    };

    const startMicrophone = useCallback(async (startMuted: boolean = false) => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            } else if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

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

            const actualSampleRate = audioContextRef.current.sampleRate;

            if (startMuted) {
                stream.getAudioTracks().forEach(track => { track.enabled = false; });
                setIsMuted(true);
            } else {
                setIsMuted(false);
            }

            const source = audioContextRef.current.createMediaStreamSource(stream);
            const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                // ⚡ Only send audio if fully active (not just connecting)
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                if (streamRef.current && !streamRef.current.getAudioTracks()[0]?.enabled) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const downsampledData = downsampleBuffer(inputData, actualSampleRate, 16000);

                const int16Data = new Int16Array(downsampledData.length);
                for (let i = 0; i < downsampledData.length; i++) {
                    const s = Math.max(-1, Math.min(1, downsampledData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                wsRef.current.send(int16Data);
            };

            source.connect(processor);
            processor.connect(audioContextRef.current.destination);

        } catch (err) {
            console.error("Microphone Error:", err);
            setIsCallActive(false);
            if (onError && err instanceof Error) onError(err);
        }
    }, [onError]);

    // ================== WEBSOCKET LOGIC ==================
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        // ⚡ Set connecting state true immediately
        setIsConnecting(true);

        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = async () => {
            console.log('✅ WebSocket connected');
            setIsConnected(true);
            // ⚡ NOTE: We do NOT set isCallActive=true or start Microphone here anymore.
            // We wait for the 'pipeline_ready' message from the backend.

            if (pendingSessionIdRef.current) {
                wsRef.current?.send(JSON.stringify({
                    type: "session_config",
                    sessionId: pendingSessionIdRef.current
                }));
                pendingSessionIdRef.current = null;
            }
        };

        wsRef.current.onclose = () => {
            setIsConnected(false);
            setIsConnecting(false); // ⚡ Stop connecting state
            setIsCallActive(false);
            pendingSessionIdRef.current = null;
        };

        wsRef.current.onerror = (error) => {
            console.error('WebSocket Error:', error);
            setIsConnected(false);
            setIsConnecting(false); // ⚡ Stop connecting state
            if (onError) onError(new Error('WebSocket connection failed'));
        };

        wsRef.current.onmessage = async (event) => { // ⚡ Async for startMicrophone
            try {
                const message: any = JSON.parse(event.data);

                switch (message.type) {
                    case 'pipeline_initializing':
                        // ⚡ Backend is starting up services
                        setIsConnecting(true);
                        break;
                    case 'pipeline_ready':
                        // ⚡ Backend is ready. Now we start the call officially.
                        console.log("🚀 Pipeline Ready. Starting Audio...");
                        setIsConnecting(false);
                        setIsCallActive(true);
                        setGreetingState(true);
                        ignoreAudioRef.current = false;
                        await startMicrophone(false);
                        break;
                    case 'simulation_started':
                        if (onSimulationStart) onSimulationStart();
                        break;
                    case 'evaluation_report':
                        if (onEvaluationReport && message.report) {
                            onEvaluationReport(message.report);
                        }
                        break;
                    case 'intro_start':
                        setGreetingState(true);
                        ignoreAudioRef.current = false;
                        break;
                    case 'intro_stop':
                        setGreetingState(false);
                        break;
                    case 'stt_final':
                    case 'transcription':
                        if (message.text) {
                            addMessage('user', message.text);
                            if (onTranscription) onTranscription(message.text);
                        }
                        break;
                    case 'backend_response':
                        if (message.text) {
                            addMessage('assistant', message.text, message.emotion);
                            if (onBackendResponse) {
                                onBackendResponse(
                                    message.text,
                                    message.emotion || 'neutral',
                                    message.telemetry || {},
                                    message.actions || []
                                );
                            }
                        }
                        break;
                    case 'tts_start':
                        stopPlayback();
                        ignoreAudioRef.current = false;
                        if (onTtsStart && message.text) onTtsStart(message.emotion || 'neutral', message.text);
                        break;
                    case 'audio':
                        if (!ignoreAudioRef.current && message.data) queueAudioChunk(message.data);
                        break;
                    case 'audio_end':
                        const now = audioContextRef.current?.currentTime || 0;
                        const remainingTimeMs = Math.max(0, (nextStartTimeRef.current - now) * 1000);
                        setTimeout(() => {
                            if (greetingInProgressRef.current) setGreetingState(false);
                            if (options.onAudioEnd) options.onAudioEnd();
                        }, remainingTimeMs);
                        break;
                    case 'tts_interrupted':
                        stopPlayback();
                        ignoreAudioRef.current = true;
                        if (onTtsInterrupted) onTtsInterrupted();
                        break;
                    case 'bot_thinking':
                        setIsThinking(true);
                        if (onThinking) onThinking(true);
                        break;
                    case 'bot_speaking':
                        setIsThinking(false);
                        setIsSpeaking(true);
                        if (onThinking) onThinking(false);
                        if (onSpeaking) onSpeaking(true);
                        break;
                    case 'bot_stopped':
                        setIsSpeaking(false);
                        if (onSpeaking) onSpeaking(false);
                        break;
                    case 'user_activity':
                        setIsThinking(false);
                        setIsSpeaking(false);
                        if (onThinking) onThinking(false);
                        if (onSpeaking) onSpeaking(false);
                        stopPlayback();
                        ignoreAudioRef.current = true;
                        break;
                    case 'error':
                        // ⚡ Stop connecting state on error
                        setIsConnecting(false);
                        if (onError && message.message) onError(new Error(message.message));
                        break;
                }
            } catch (e) {
                console.error("WS Parse Error:", e);
            }
        };
    }, [wsUrl, onTranscription, onBackendResponse, onTtsStart, onTtsInterrupted, onSimulationStart, onEvaluationReport, onError, queueAudioChunk, stopPlayback, options, startMicrophone]);

    const disconnect = useCallback(() => {
        stopCall();
        wsRef.current?.close();
        wsRef.current = null;
        setIsConnected(false);
        setIsConnecting(false);
    }, []);

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
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "session_end" }));
            wsRef.current.close();
        }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        stopPlayback();
        setIsCallActive(false);
        setIsConnecting(false); // ⚡ Ensure connecting state is cleared
        setGreetingState(false);
        setIsMuted(false);
        setMessages([]);
        pendingSessionIdRef.current = null;
    }, [stopPlayback]);

    const startCall = useCallback(async (sessionId: string = "default") => {
        if (isCallActive || greetingInProgress || isConnecting) return; // ⚡ Check isConnecting

        setIsConnecting(true); // ⚡ Immediate feedback
        pendingSessionIdRef.current = sessionId;

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            connect();
        } else {
            wsRef.current.send(JSON.stringify({
                type: "session_config",
                sessionId: sessionId
            }));
            // ⚡ Do NOT set active here; wait for pipeline_ready msg
            // However, if the socket is already open and ready, we should arguably wait for acknowledgment 
            // or we might need to assume it's ready if the backend doesn't send ready signal on reconfiguration.
            // For now, let's assume a fresh connection flow for safety or that backend sends ready signal on re-config.
            // But if existing connection, backend might not resend pipeline_ready.
            // If the connection was kept open, we might need to handle this.
            // Given the stopCall closes the socket, we usually reconnect.
        }
    }, [isCallActive, greetingInProgress, isConnecting, connect]);

    useEffect(() => {
        return () => {
            stopCall();
        };
    }, []);

    return {
        isConnected,
        isConnecting, // ⚡ Return new state
        isCallActive,
        greetingInProgress,
        isThinking,
        isSpeaking,
        isMuted,
        messages,
        connect,
        disconnect,
        startCall,
        stopCall,
        toggleMute
    };
};