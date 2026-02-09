import { useEffect, useRef, useState, useCallback } from 'react';

interface AudioMessage {
    type: 'transcription' | 'audio' | 'audio_end' | 'tts_start' | 'tts_interrupted';
    text?: string;
    data?: string;
    emotion?: string;
}

interface UseWebSocketAudioOptions {
    wsUrl?: string;
    onTranscription?: (text: string) => void;
    onAudioChunk?: (data: string) => void;
    onAudioEnd?: () => void;
    onTtsStart?: (emotion: string, text: string) => void;
    onTtsInterrupted?: () => void;
    onError?: (error: Error) => void;
}

export const useWebSocketAudio = (options: UseWebSocketAudioOptions = {}) => {
    const {
        wsUrl = 'ws://localhost:5007/ws', // Default to port 5008 as per backend guide
        onTranscription,
        onAudioChunk,
        onAudioEnd,
        onTtsStart,
        onTtsInterrupted,
        onError,
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    // Connect to WebSocket
    const connect = useCallback(() => {
        try {
            if (wsRef.current?.readyState === WebSocket.OPEN) return;

            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                console.log('✅ WebSocket connected');
                setIsConnected(true);
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const message: AudioMessage = JSON.parse(event.data);

                    switch (message.type) {
                        case 'transcription':
                            if (message.text && onTranscription) onTranscription(message.text);
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
                setIsConnected(false);
            };
        } catch (error) {
            if (onError && error instanceof Error) onError(error);
        }
    }, [wsUrl, onTranscription, onAudioChunk, onAudioEnd, onTtsStart, onTtsInterrupted, onError]);

    const disconnect = useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        setIsConnected(false);
    }, []);

    const sendAudio = useCallback((data: Uint8Array) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(data);
        }
    }, []);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Use chunks of 100ms for real-time streaming
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    const buffer = await event.data.arrayBuffer();
                    sendAudio(new Uint8Array(buffer));
                }
            };

            mediaRecorder.start(100);
            mediaRecorderRef.current = mediaRecorder;
            setIsRecording(true);
        } catch (err) {
            if (onError && err instanceof Error) onError(err);
        }
    }, [sendAudio, onError]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            setIsRecording(false);
        }
    }, [isRecording]);

    // Cleanup
    useEffect(() => {
        return () => {
            stopRecording();
            disconnect();
        };
    }, [disconnect, stopRecording]);

    return { isConnected, isRecording, connect, disconnect, startRecording, stopRecording };
};