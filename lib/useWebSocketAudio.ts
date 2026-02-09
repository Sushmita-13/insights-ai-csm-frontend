import { useEffect, useRef, useState, useCallback } from 'react';

interface AudioMessage {
    type: 'stt_final' | 'backend_response' | 'transcription' | 'audio' | 'audio_end' | 'tts_start' | 'tts_interrupted';
    text?: string;
    data?: string;
    emotion?: string;
    telemetry?: any;
    actions?: string[];
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
        onAudioChunk,
        onAudioEnd,
        onTtsStart,
        onTtsInterrupted,
        onError,
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // Track if the user is holding the button
    const isActiveRef = useRef(false);

    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    // Connect to WebSocket
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
                        if (message.data && onAudioChunk) onAudioChunk(message.data);
                        break;
                    case 'audio_end':
                        if (onAudioEnd) onAudioEnd();
                        break;
                    case 'tts_start':
                        if (onTtsStart && message.text) onTtsStart(message.emotion || 'neutral', message.text);
                        break;
                    case 'tts_interrupted':
                        if (onTtsInterrupted) onTtsInterrupted();
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
        };
    }, [wsUrl, onTranscription, onBackendResponse, onAudioChunk, onAudioEnd, onTtsStart, onTtsInterrupted, onError]);

    const disconnect = useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        setIsConnected(false);
    }, []);

    const startRecording = useCallback(async () => {
        if (isActiveRef.current) return;
        isActiveRef.current = true;

        try {
            // 1. Create Audio Context (Must be 16kHz for backend VAD)
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            // Log the actual rate to debug browser behavior
            console.log(`🎙️ Audio Sample Rate: ${audioContext.sampleRate}Hz`);

            // 2. Get Microphone Access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000 // Hint to browser
                }
            });

            if (!isActiveRef.current) {
                console.log("🛑 Button released during init. Aborting.");
                stream.getTracks().forEach(t => t.stop());
                audioContext.close();
                return;
            }

            streamRef.current = stream;

            // 3. Audio Pipeline
            const source = audioContext.createMediaStreamSource(stream);
            sourceRef.current = source;

            // Buffer size 4096 is a good balance for latency/performance
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);

                // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                wsRef.current.send(int16Data.buffer);
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            setIsRecording(true);
            console.log("🎤 Recording Started");

        } catch (err) {
            console.error("Microphone Error:", err);
            isActiveRef.current = false;
            if (onError && err instanceof Error) onError(err);
        }
    }, [onError]);

    const stopRecording = useCallback(() => {
        console.log("🛑 Stop Requested");
        isActiveRef.current = false;

        // --- CRITICAL FIX: Send Silence to Trigger Backend VAD ---
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log("📤 Sending silence burst to trigger VAD...");
            // Send ~1 second of silence (16000 samples)
            const silence = new Int16Array(16000).fill(0);
            wsRef.current.send(silence.buffer);
        }
        // ---------------------------------------------------------

        // Clean up audio resources
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
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setIsRecording(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
            disconnect();
        };
    }, []);

    return { isConnected, isRecording, connect, disconnect, startRecording, stopRecording };
};