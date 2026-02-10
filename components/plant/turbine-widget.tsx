'use client';

import React from 'react';
import { TurbineState, GeneratorState, GridState } from '@/types/plant';
import { StatusGauge } from './status-gauge';

interface TurbineWidgetProps {
    turbine: TurbineState;
    generator: GeneratorState;
    grid: GridState;
}

export function TurbineWidget({ turbine, generator, grid }: TurbineWidgetProps) {
    const freqDiff = Math.abs(grid.frequency.value - 50.0);
    const freqStatus = freqDiff > 0.5 ? 'critical' : freqDiff > 0.2 ? 'warning' : 'normal';

    return (
        <div className="bg-gray-950 p-6 rounded-xl border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-800 pb-2">
                ⚡ Turbine & Grid
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusGauge
                    label="Grid Freq"
                    value={grid.frequency.value}
                    min={48.0} max={52.0}
                    unit="Hz"
                    status={freqStatus}
                />
                <StatusGauge
                    label="Load (MW)"
                    value={generator.load.value}
                    min={0} max={700}
                    unit="MW"
                    status={generator.load.status}
                />
                <StatusGauge
                    label="Speed"
                    value={turbine.speed.value}
                    min={0} max={3300}
                    unit="RPM"
                    status={turbine.speed.status}
                />
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex flex-col justify-center items-center">
                    <span className="text-gray-400 text-sm mb-1">Power Factor</span>
                    <div className="text-3xl font-mono text-purple-400">
                        {generator.power_factor.toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
    );
}
