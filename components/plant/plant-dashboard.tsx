'use client';

import React from 'react';
import { usePlantSocket } from '@/hooks/usePlantSocket';
import { BoilerWidget } from './boiler-widget';
import { TurbineWidget } from './turbine-widget';
import { MillsWidget } from './mills-widget';

interface PlantDashboardProps {
    simulationActive?: boolean;
}

export function PlantDashboard({ simulationActive = false }: PlantDashboardProps) {
    const { plantState, isConnected, sendAction } = usePlantSocket();

    if (!plantState || !simulationActive) {
        return (
            <div className="flex flex-col gap-4 items-center justify-center min-h-[500px] text-gray-500">
                <div className="text-xl font-mono animate-pulse">
                    {isConnected
                        ? (simulationActive ? 'Syncing with Plant Digital Twin...' : 'Waiting for Simulation Start...')
                        : 'Connecting to Simulation Server...'}
                </div>
                {!simulationActive && isConnected && (
                    <div className="text-sm opacity-75">
                        Complete the safety briefing with Sentinel to begin.
                    </div>
                )}
                <div className="text-xs text-gray-700">Backend: localhost:8000</div>
            </div>
        );
    }

    const { plantState: s } = { plantState }; // Alias for shortness if needed, but plantState is fine

    return (
        <div className="h-full w-full flex flex-col space-y-4">
            {/* Header Stat Bar - Compact */}
            <div className="flex-none flex flex-row items-center justify-between bg-black/40 p-3 rounded-lg border border-gray-800 backdrop-blur">
                <div className="flex items-center gap-4">
                    <div className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${plantState.overall_status === 'normal' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500 animate-pulse border border-red-900'
                        }`}>
                        STATUS: {plantState.overall_status}
                    </div>
                    <div className="text-gray-400 text-xs font-mono hidden md:block">
                        MODE: <span className="text-white">{plantState.scenario_mode}</span>
                    </div>
                </div>

                <div className="text-right text-xs text-gray-500 font-mono">
                    TIME: <span className="text-white text-base">{plantState.scenario_time.toFixed(1)}s</span>
                </div>
            </div>

            {/* Main Grid - Auto scale height */}
            <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="overflow-y-auto custom-scrollbar pr-2">
                    <TurbineWidget
                        turbine={plantState.turbine}
                        generator={plantState.generator}
                        grid={plantState.grid}
                    />
                </div>
                <div className="overflow-y-auto custom-scrollbar pr-2">
                    <BoilerWidget
                        data={plantState.boiler_drum}
                        valves={plantState.spray_water_valves}
                        onSprayAdjust={(val) => sendAction('ADJUST_SPRAY', { value: val })}
                    />
                </div>
            </div>

            {/* Bottom Panel - Fixed Height or adapt */}
            <div className="flex-none">
                <MillsWidget
                    mills={plantState.coal_mills}
                    onTrip={(id) => sendAction('TRIP_MILL', { mill_id: id })}
                />
            </div>
        </div>
    );
}
