'use client';

import React from 'react';
import { BoilerState, SprayValve } from '@/types/plant';
import { StatusGauge } from './status-gauge';

interface BoilerWidgetProps {
    data: BoilerState;
    valves: SprayValve[];
    onSprayAdjust: (val: number) => void;
}

export function BoilerWidget({ data, valves, onSprayAdjust }: BoilerWidgetProps) {
    const mainValve = valves[0];

    return (
        <div className="bg-gray-950 p-6 rounded-xl border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-800 pb-2">
                🔥 Boiler System
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatusGauge
                    label="Drum Pressure"
                    value={data.pressure.value}
                    min={100} max={210}
                    unit="Bar"
                    status={data.pressure.status}
                />
                <StatusGauge
                    label="Steam Flow"
                    value={data.steam_flow_out.value}
                    min={0} max={2200}
                    unit="TPH"
                    status={data.steam_flow_out.status}
                />
                <StatusGauge
                    label="Temp"
                    value={data.temperature.value}
                    min={300} max={600}
                    unit="°C"
                    status={data.temperature.status}
                />

                {/* Spray Valve Controls */}
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex flex-col justify-between">
                    <div className="mb-2">
                        <span className="text-gray-400 text-sm">Spray Valve</span>
                        <div className="text-2xl font-bold text-blue-400">
                            {mainValve?.position.value.toFixed(1)}%
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => onSprayAdjust(-5)}
                            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded px-2 py-1 text-sm border border-gray-600 transition"
                        >
                            -5%
                        </button>
                        <button
                            onClick={() => onSprayAdjust(5)}
                            className="flex-1 bg-blue-900 hover:bg-blue-800 text-white rounded px-2 py-1 text-sm border border-blue-700 transition"
                        >
                            +5%
                        </button>
                    </div>
                </div>
            </div>

            <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-orange-500 to-red-600 transition-all duration-500"
                    style={{ width: `${(data.steam_flow_out.value / 2200) * 100}%` }}
                />
            </div>
        </div>
    );
}
