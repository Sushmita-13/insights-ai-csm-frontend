'use client';

import React from 'react';
import { CoalMill } from '@/types/plant';

interface Props {
    mills: CoalMill[];
    onTrip: (id: string) => void;
}

export function MillsWidget({ mills, onTrip }: Props) {
    return (
        <div className="p-6 bg-gray-950 rounded-xl border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-800 pb-2">
                🏭 Coal Mills Control
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {mills.map((mill) => {
                    const isRunning = mill.status === 'running';
                    const isTripped = mill.status === 'tripped';

                    return (
                        <div
                            key={mill.id}
                            className={`
                relative p-3 rounded-lg border-2 transition-all
                ${isRunning ? 'border-green-600 bg-green-900/20' : 'border-red-800 bg-red-900/20'}
              `}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-white">{mill.name}</span>
                                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                            </div>

                            <div className="text-xs text-gray-400 mb-2">
                                Flow: <span className="text-white">{mill.coal_flow.value.toFixed(0)}</span> TPH
                            </div>

                            <button
                                onClick={() => onTrip(mill.id)}
                                disabled={!isRunning}
                                className={`
                  w-full py-1 text-xs font-bold rounded uppercase
                  ${isRunning
                                        ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer'
                                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                    }
                `}
                            >
                                {isTripped ? 'TRIPPED' : 'TRIP'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
