import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrafficStats } from '../services/api'

interface TrafficChartProps {
    metrics: TrafficStats
}

interface DataPoint {
    time: string
    uplink: number
    downlink: number
}

export default function TrafficChart({ metrics }: TrafficChartProps) {
    const [history, setHistory] = useState<DataPoint[]>([])

    useEffect(() => {
        const now = new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })

        setHistory(prev => {
            const newHistory = [
                ...prev,
                {
                    time: now,
                    uplink: metrics.uplink.throughput_mbps,
                    downlink: metrics.downlink.throughput_mbps,
                }
            ]
            // Keep only last 60 entries (1 minute of data at 1s interval)
            if (newHistory.length > 60) {
                return newHistory.slice(-60)
            }
            return newHistory
        })
    }, [metrics])

    if (history.length < 2) {
        return (
            <div className="h-64 flex items-center justify-center text-slate-400">
                <div className="text-center">
                    <div className="animate-pulse mb-2">📊</div>
                    <p>Collecting data...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                        dataKey="time"
                        stroke="#64748b"
                        fontSize={12}
                        tickLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        stroke="#64748b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value} Mbps`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="uplink"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={false}
                        name="Uplink"
                    />
                    <Line
                        type="monotone"
                        dataKey="downlink"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        name="Downlink"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
