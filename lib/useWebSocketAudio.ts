"use client";
import { useEffect, useRef, useState, useCallback } from 'react';

interface AudioMessage {
    type: 'stt_final' | 'backend_response' | 'transcription' | 'audio' | 'audio_end' | 'tts_start' | 'tts_interrupted' | 'error' | 'bot_thinking' | 'bot_speaking' | 'bot_stopped' | 'user_activity';
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
    onSimulationStart?: () => void;
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
    const isPlayingRef = useRef(false);
    const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);

    const residueRef = useRef<Uint8Array | null>(null);

    const [isConnected, setIsConnected] = useState(false);
    const [isCallActive, setIsCallActive] = useState(false);
    const [greetingInProgress, setGreetingInProgress] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const greetingInProgressRef = useRef(false);

    const setGreetingState = (active: boolean) => {
        setGreetingInProgress(active);
        greetingInProgressRef.current = active;
    };

    // ================== AUDIO PLAYBACK LOGIC ==================

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
            // ⚡ OPTIMIZATION: Reduced buffer from 0.05 to 0.02 for tighter playback
            const startTime = Math.max(now + 0.02, nextStartTimeRef.current);

            source.start(startTime);
            nextStartTimeRef.current = startTime + buffer.duration;
            activeSourceRef.current = source;

        } catch (e) {
            console.error("Audio Queue Error:", e);
        }
    }, []);

    const stopPlayback = useCallback(() => {
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
        isPlayingRef.current = false;
    }, []);

    // ================== MICROPHONE SETUP & DOWNSAMPLING ==================

    // Simple downsampler to ensure we send 16kHz to backend
    const downsampleBuffer = (buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) => {
        if (outputSampleRate === inputSampleRate) {
            return buffer;
        }
        const sampleRateRatio = inputSampleRate / outputSampleRate;
        const newLength = Math.round(buffer.length / sampleRateRatio);
        const result = new Float32Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);

            // Simple linear accumulation (averaging) prevents aliasing better than just skipping
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
                // Try to request 16kHz, but browser might ignore it
                audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            } else if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            const actualSampleRate = audioContextRef.current.sampleRate;
            console.log(`🎙️ Microphone Setup: Context running at ${actualSampleRate}Hz (Target: 16000Hz)`);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    // We request 16k, but must handle fallback
                    sampleRate: 16000
                }
            });
            streamRef.current = stream;

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
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                if (streamRef.current && !streamRef.current.getAudioTracks()[0]?.enabled) return;

                const inputData = e.inputBuffer.getChannelData(0);

                // ⚡ CORE FIX: Downsample if necessary
                const downsampledData = downsampleBuffer(inputData, actualSampleRate, 16000);

                // Convert Float32 to Int16
                const int16Data = new Int16Array(downsampledData.length);
                for (let i = 0; i < downsampledData.length; i++) {
                    const s = Math.max(-1, Math.min(1, downsampledData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                wsRef.current.send(int16Data);
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
                    case 'simulation_started':
                        if (onSimulationStart) onSimulationStart();
                        break;

                    case 'intro_start':
                        console.log("👋 AI Greeting Beginning");
                        setGreetingState(true);
                        break;

                    case 'intro_stop':
                        console.log("👋 AI Greeting Finished");
                        setGreetingState(false);
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
                        stopPlayback();
                        if (onTtsStart && message.text) onTtsStart(message.emotion || 'neutral', message.text);
                        break;

                    case 'audio':
                        if (message.data) queueAudioChunk(message.data);
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
                        // If user starts talking, bot should stop thinking/speaking instantly
                        setIsThinking(false);
                        setIsSpeaking(false);
                        if (onThinking) onThinking(false);
                        if (onSpeaking) onSpeaking(false);
                        stopPlayback();
                        break;

                    case 'error':
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
    }, []);

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
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "session_end" }));
        }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        stopPlayback();
        setIsCallActive(false);
        setGreetingState(false);
        setIsMuted(false);
    }, [stopPlayback]);

    const startCall = useCallback(async (sessionId?: string) => {
        if (isCallActive || greetingInProgress) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            if (sessionId) {
                wsRef.current.send(JSON.stringify({
                    type: "session_config",
                    sessionId: sessionId
                }));
            }
            console.log("⏳ Starting Call: Microphone active immediately.");
            setGreetingState(true);
            await startMicrophone(false); // Starts unmuted
        }
    }, [isCallActive, greetingInProgress, startMicrophone]);

    useEffect(() => {
        return () => {
            stopCall();
            wsRef.current?.close();
        };
    }, []);

    return {
        isConnected,
        isCallActive,
        greetingInProgress,
        isThinking,
        isSpeaking,
        isMuted,
        connect,
        disconnect,
        startCall,
        stopCall,
        toggleMute
    };
};