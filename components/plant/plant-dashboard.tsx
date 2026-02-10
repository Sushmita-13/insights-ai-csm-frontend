'use client';

import React from 'react';
import { usePlantSocket } from '@/hooks/usePlantSocket';
import { BoilerWidget } from './boiler-widget';
import { TurbineWidget } from './turbine-widget';
import { MillsWidget } from './mills-widget';

export function PlantDashboard() {
    const { plantState, isConnected, sendAction } = usePlantSocket();

    if (!plantState) {
        return (
            <div className="flex flex-col gap-4 items-center justify-center min-h-[500px] text-gray-500 animate-pulse">
                <div className="text-xl font-mono">
                    {isConnected ? 'Syncing with Plant Digital Twin...' : 'Connecting to Simulation Server...'}
                </div>
                <div className="text-sm">Ensure Backend is running on localhost:8000</div>
            </div>
        );
    }

    const { plantState: s } = { plantState }; // Alias for shortness if needed, but plantState is fine

    return (
        <div className="w-full max-w-[1600px] mx-auto p-4 space-y-6">
            {/* Header Stat Bar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-black/40 p-4 rounded-lg border border-gray-800 backdrop-blur gap-4">
                <div className="flex items-center gap-4">
                    <div className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${plantState.overall_status === 'normal' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500 animate-pulse border border-red-900'
                        }`}>
                        STATUS: {plantState.overall_status}
                    </div>
                    <div className="text-gray-400 text-sm font-mono">
                        MODE: <span className="text-white">{plantState.scenario_mode}</span>
                    </div>
                </div>

                <div className="text-right text-xs text-gray-500 font-mono">
                    SIMULATION TIME: <span className="text-white text-lg">{plantState.scenario_time.toFixed(1)}s</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <TurbineWidget
                    turbine={plantState.turbine}
                    generator={plantState.generator}
                    grid={plantState.grid}
                />
                <BoilerWidget
                    data={plantState.boiler_drum}
                    valves={plantState.spray_water_valves}
                    onSprayAdjust={(val) => sendAction('ADJUST_SPRAY', { value: val })}
                />
            </div>

            <MillsWidget
                mills={plantState.coal_mills}
                onTrip={(id) => sendAction('TRIP_MILL', { mill_id: id })} // Fixed: Pass proper payload key
            />
        </div>
    );
}
