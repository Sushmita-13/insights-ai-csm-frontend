import React from 'react';

interface GaugeProps {
    value: number;
    min: number;
    max: number;
    label: string;
    unit: string;
    status?: 'normal' | 'warning' | 'critical' | 'alarm_high' | 'alarm_low' | 'tripped';
}

export function StatusGauge({ value, min, max, label, unit, status = 'normal' }: GaugeProps) {
    // Normalize value to 0-100 for SVG calculation
    const range = max - min;
    const normalized = Math.max(0, Math.min(100, ((value - min) / range) * 100));

    // SVG Arc Math
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (normalized / 100) * circumference;

    // Color mapping
    const getColor = () => {
        switch (status) {
            case 'normal': return 'text-green-500';
            case 'warning': return 'text-yellow-500';
            case 'critical':
            case 'alarm_high':
            case 'alarm_low':
            case 'tripped': return 'text-red-500 animate-pulse';
            default: return 'text-blue-500';
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-4 bg-gray-900 rounded-lg shadow-lg border border-gray-800 w-full">
            <div className="relative w-32 h-32">
                {/* Background Circle */}
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        cx="64"
                        cy="64"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        className="text-gray-700"
                    />
                    {/* Progress Circle */}
                    <circle
                        cx="64"
                        cy="64"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className={`transition-all duration-500 ease-out ${getColor()}`}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-xl font-bold ${getColor()}`}>
                        {value.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400">{unit}</span>
                </div>
            </div>
            <span className="mt-2 text-sm font-medium text-gray-300 uppercase tracking-wider">
                {label}
            </span>
        </div>
    );
}
