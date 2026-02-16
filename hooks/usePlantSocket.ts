import { useEffect, useState, useRef, useCallback } from 'react';
import { PlantState } from '../types/plant';

const WS_URL = 'ws://localhost:8000/ws/simulation';

export function usePlantSocket() {
    const [plantState, setPlantState] = useState<PlantState | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('✅ Connected to Plant Simulation');
            setIsConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                // FIX: Check if this is an action confirmation event
                // The backend now sends { type: 'action_executed', ... } events
                if (message.type === 'action_executed') {
                    console.log(`✅ Action confirmed: ${message.action} ${message.target || message.value}`);
                    // Return early so we don't try to parse this as PlantState
                    return;
                }

                // Otherwise, assume it is a PlantState update
                const data: PlantState = message;
                setPlantState(data);
            } catch (err) {
                console.error('❌ Failed to parse plant state:', err);
            }
        };

        ws.onclose = () => {
            console.log('🔌 Disconnected from Plant Simulation');
            setIsConnected(false);
        };

        ws.onerror = (err) => {
            console.error('❌ WebSocket Error:', err);
        };

        return () => {
            ws.close();
        };
    }, []);

    const sendAction = useCallback((action: string, payload: any = {}) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action, payload }));
        } else {
            console.warn('⚠️ Cannot send action, WebSocket not connected');
        }
    }, []);

    return { plantState, isConnected, sendAction };
}