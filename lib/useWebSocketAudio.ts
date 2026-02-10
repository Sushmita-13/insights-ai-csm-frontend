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
    onError?: (error: Error) => void;
}

export const useWebSocketAudio = (options: UseWebSocketAudioOptions = {}) => {
    const {
        wsUrl = 'ws://localhost:5007/ws',
        onTranscription,
        onBackendResponse,
        onTtsStart,
        onTtsInterrupted,
        onError,
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // Audio Queue System
    const audioQueueRef = useRef<Array<{ buffer: AudioBuffer }>>([]);
    const isPlayingRef = useRef(false);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

    const [isConnected, setIsConnected] = useState(false);
    const [isCallActive, setIsCallActive] = useState(false);

    // ================== AUDIO PLAYBACK LOGIC ==================
    const playNextInQueue = useCallback(async () => {
        if (!audioContextRef.current || audioQueueRef.current.length === 0 || isPlayingRef.current) {
            return;
        }

        isPlayingRef.current = true;
        const item = audioQueueRef.current.shift();

        if (!item) {
            isPlayingRef.current = false;
            return;
        }

        try {
            const source = audioContextRef.current.createBufferSource();
            source.buffer = item.buffer;
            source.connect(audioContextRef.current.destination);
            currentSourceRef.current = source;

            source.onended = () => {
                currentSourceRef.current = null;
                isPlayingRef.current = false;
                playNextInQueue();
            };

            source.start(0);
        } catch (e) {
            console.error("Playback Error:", e);
            isPlayingRef.current = false;
            playNextInQueue();
        }
    }, []);

    const queueAudioChunk = useCallback(async (base64Data: string) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        }

        try {
            const binaryString = window.atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Decode asynchronously
            const buffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
            audioQueueRef.current.push({ buffer });
            playNextInQueue();
        } catch (e) {
            console.error("Audio Decode Error:", e);
        }
    }, [playNextInQueue]);

    const stopPlayback = useCallback(() => {
        if (currentSourceRef.current) {
            try {
                currentSourceRef.current.stop();
            } catch (e) { /* ignore */ }
            currentSourceRef.current = null;
        }
        audioQueueRef.current = [];
        isPlayingRef.current = false;
    }, []);

    // ================== WEBSOCKET LOGIC ==================
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        console.log(`🔌 Connecting to ${wsUrl}...`);
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            console.log('✅ WebSocket connected');
            setIsConnected(true);
        };

        wsRef.current.onmessage = (event) => {
            try {
                const message: AudioMessage = JSON.parse(event.data);
                switch (message.type) {
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

                    case 'audio':
                        if (message.data) queueAudioChunk(message.data);
                        break;

                    case 'tts_start':
                        if (onTtsStart && message.text) onTtsStart(message.emotion || 'neutral', message.text);
                        break;

                    case 'tts_interrupted':
                        console.log("⚡ Barge-in detected! Stopping playback.");
                        stopPlayback();
                        if (onTtsInterrupted) onTtsInterrupted();
                        break; // Important: Prioritize stopping audio

                    case 'error':
                        console.error("Server Error:", message.message);
                        if (onError && message.message) onError(new Error(message.message));
                        break;
                }
            } catch (e) {
                console.error("Parse Error:", e);
            }
        };

        wsRef.current.onerror = (error) => {
            console.error('WebSocket Error:', error);
            setIsConnected(false);
            if (onError) onError(new Error('WebSocket connection failed'));
        };

        wsRef.current.onclose = () => {
            console.log('🔌 WebSocket disconnected');
            setIsConnected(false);
            setIsCallActive(false);
        };
    }, [wsUrl, onTranscription, onBackendResponse, onTtsStart, onTtsInterrupted, onError, queueAudioChunk, stopPlayback]);

    const disconnect = useCallback(() => {
        stopCall();
        wsRef.current?.close();
        wsRef.current = null;
        setIsConnected(false);
    }, []);

    // ================== MICROPHONE / CALL LOGIC ==================
    const startCall = useCallback(async () => {
        if (isCallActive) return;

        try {
            // 1. Create Audio Context
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            // Re-use or create new context
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            } else if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            console.log(`🎙️ Audio Sample Rate: ${audioContextRef.current.sampleRate}Hz`);

            // 2. Get Microphone
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

            // 3. Setup Audio Pipeline
            const source = audioContextRef.current.createMediaStreamSource(stream);
            sourceRef.current = source;

            const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);
                // Convert to Int16
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
            console.log("📞 Call Started");

        } catch (err) {
            console.error("Microphone Error:", err);
            setIsCallActive(false);
            if (onError && err instanceof Error) onError(err);
        }
    }, [isCallActive, onError]);

    const stopCall = useCallback(() => {
        console.log("☎️ Ending Call");

        // Cleanup Mic
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (processorRef.current && sourceRef.current) {
            sourceRef.current.disconnect();
            processorRef.current.disconnect();
            processorRef.current = null;
            sourceRef.current = null;
        }

        // Send silence to ensure VAD closes if it was open (optional but good practice)
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const silence = new Int16Array(16000).fill(0);
            wsRef.current.send(silence.buffer);
        }

        setIsCallActive(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCall();
            disconnect();
        };
    }, []);

    return {
        isConnected,
        isCallActive,
        connect,
        disconnect,
        startCall,
        stopCall
    };
};