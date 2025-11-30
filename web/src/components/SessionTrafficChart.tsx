import { useState, useEffect, useMemo } from 'react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts'
import { SessionInfo } from '../services/api'

interface SessionTrafficChartProps {
    sessions: SessionInfo[]
    theme?: 'dark' | 'light'
}

interface SessionTrafficData {
    name: string
    seid: string
    ue_ip: string
    uplink: number
    downlink: number
    total: number
    packetsUL: number
    packetsDL: number
}

interface SessionHistoryPoint {
    time: string
    [key: string]: number | string
}

const COLORS = [
    '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1'
]

function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`
    return `${bytes} B`
}

function formatThroughput(bytes: number, seconds: number = 1): string {
    const bps = (bytes * 8) / seconds
    if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`
    if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`
    if (bps >= 1e3) return `${(bps / 1e3).toFixed(2)} Kbps`
    return `${bps.toFixed(0)} bps`
}

type ViewMode = 'bar' | 'pie' | 'trend'

export default function SessionTrafficChart({ sessions, theme = 'dark' }: SessionTrafficChartProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('bar')
    const [sortBy, setSortBy] = useState<'total' | 'uplink' | 'downlink'>('total')
    const [sessionHistory, setSessionHistory] = useState<Map<string, { bytes: number; time: number }[]>>(new Map())

    // Theme-based styles
    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0'
    const axisColor = theme === 'dark' ? '#64748b' : '#94a3b8'
    const tooltipBg = theme === 'dark' ? '#1e293b' : '#ffffff'
    const tooltipBorder = theme === 'dark' ? '#334155' : '#e2e8f0'
    const textColor = theme === 'dark' ? '#e2e8f0' : '#1e293b'
    const mutedText = theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
    const buttonBg = theme === 'dark' ? 'bg-slate-700' : 'bg-gray-200'
    const buttonText = theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
    const cardBg = theme === 'dark' ? 'bg-slate-700/50' : 'bg-gray-100'
    const textPrimary = theme === 'dark' ? 'text-white' : 'text-gray-900'
    const tableBorder = theme === 'dark' ? 'border-slate-700' : 'border-gray-200'
    const tableHover = theme === 'dark' ? 'hover:bg-slate-700/30' : 'hover:bg-gray-50'
    const selectBg = theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'
    const progressBg = theme === 'dark' ? 'bg-slate-700' : 'bg-gray-200'

    // Transform session data for charts
    const sessionData: SessionTrafficData[] = useMemo(() => {
        return sessions
            .map((session, index) => ({
                name: `UE ${index + 1}`,
                seid: session.seid,
                ue_ip: session.ue_ip,
                uplink: session.bytes_ul || 0,
                downlink: session.bytes_dl || 0,
                total: (session.bytes_ul || 0) + (session.bytes_dl || 0),
                packetsUL: session.packets_ul || 0,
                packetsDL: session.packets_dl || 0,
            }))
            .sort((a, b) => b[sortBy] - a[sortBy])
    }, [sessions, sortBy])

    // Track session history for trend view
    useEffect(() => {
        if (sessions.length === 0) return

        const now = Date.now()
        setSessionHistory(prev => {
            const newHistory = new Map(prev)

            sessions.forEach(session => {
                const key = session.seid
                const totalBytes = (session.bytes_ul || 0) + (session.bytes_dl || 0)

                const history = newHistory.get(key) || []
                history.push({ bytes: totalBytes, time: now })

                // Keep only last 60 seconds
                const cutoff = now - 60000
                const filtered = history.filter(h => h.time > cutoff)
                newHistory.set(key, filtered)
            })

            return newHistory
        })
    }, [sessions])

    // Calculate trend data
    const trendData = useMemo(() => {
        const points: SessionHistoryPoint[] = []
        const now = Date.now()

        // Create time buckets (every 5 seconds for last 60 seconds)
        for (let i = 12; i >= 0; i--) {
            const bucketTime = now - i * 5000
            const point: SessionHistoryPoint = {
                time: new Date(bucketTime).toLocaleTimeString('en-US', {
                    hour12: false,
                    minute: '2-digit',
                    second: '2-digit'
                })
            }

            // Find bytes for each session at this time
            sessions.slice(0, 5).forEach((session, idx) => {
                const history = sessionHistory.get(session.seid) || []
                // Find closest data point
                const closest = history.reduce((prev, curr) => {
                    return Math.abs(curr.time - bucketTime) < Math.abs(prev.time - bucketTime) ? curr : prev
                }, { bytes: 0, time: 0 })
                point[`session${idx}`] = closest.bytes
            })

            points.push(point)
        }

        return points
    }, [sessions, sessionHistory])

    // Pie chart data
    const pieData = useMemo(() => {
        return sessionData.slice(0, 8).map((session, index) => ({
            name: session.ue_ip,
            value: session.total,
            color: COLORS[index % COLORS.length]
        }))
    }, [sessionData])

    // Calculate totals
    const totals = useMemo(() => {
        return sessionData.reduce(
            (acc, s) => ({
                uplink: acc.uplink + s.uplink,
                downlink: acc.downlink + s.downlink,
                total: acc.total + s.total,
                packetsUL: acc.packetsUL + s.packetsUL,
                packetsDL: acc.packetsDL + s.packetsDL,
            }),
            { uplink: 0, downlink: 0, total: 0, packetsUL: 0, packetsDL: 0 }
        )
    }, [sessionData])

    if (sessions.length === 0) {
        return (
            <div className={`h-80 flex items-center justify-center ${mutedText}`}>
                <div className="text-center">
                    <div className="text-4xl mb-2">📊</div>
                    <p>No active sessions</p>
                    <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>Session traffic will appear here</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <span className={`text-sm ${mutedText}`}>View:</span>
                    <div className={`flex ${buttonBg} rounded-lg p-1`}>
                        {(['bar', 'pie', 'trend'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === mode
                                    ? 'bg-blue-500 text-white'
                                    : buttonText
                                    }`}
                            >
                                {mode === 'bar' ? '📊 Bar' : mode === 'pie' ? '🥧 Pie' : '📈 Trend'}
                            </button>
                        ))}
                    </div>
                </div>

                {viewMode === 'bar' && (
                    <div className="flex items-center gap-2">
                        <span className={`text-sm ${mutedText}`}>Sort by:</span>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                            className={`${selectBg} ${textPrimary} text-sm rounded-lg px-3 py-1 border`}
                        >
                            <option value="total">Total Traffic</option>
                            <option value="uplink">Uplink</option>
                            <option value="downlink">Downlink</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className={`${cardBg} rounded-lg p-3`}>
                    <div className={`text-xs ${mutedText}`}>Total Sessions</div>
                    <div className={`text-xl font-bold ${textPrimary}`}>{sessions.length}</div>
                </div>
                <div className={`${cardBg} rounded-lg p-3`}>
                    <div className={`text-xs ${mutedText}`}>Total Traffic</div>
                    <div className={`text-xl font-bold ${textPrimary}`}>{formatBytes(totals.total)}</div>
                </div>
                <div className={`${cardBg} rounded-lg p-3`}>
                    <div className="text-xs text-green-400">↑ Total Uplink</div>
                    <div className="text-xl font-bold text-green-400">{formatBytes(totals.uplink)}</div>
                </div>
                <div className={`${cardBg} rounded-lg p-3`}>
                    <div className="text-xs text-blue-400">↓ Total Downlink</div>
                    <div className="text-xl font-bold text-blue-400">{formatBytes(totals.downlink)}</div>
                </div>
            </div>

            {/* Chart */}
            <div className="h-72">
                {viewMode === 'bar' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={sessionData.slice(0, 10)}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                            <XAxis
                                type="number"
                                stroke={axisColor}
                                fontSize={11}
                                tickFormatter={(value) => formatBytes(value)}
                            />
                            <YAxis
                                type="category"
                                dataKey="ue_ip"
                                stroke={axisColor}
                                fontSize={11}
                                width={90}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: tooltipBg,
                                    border: `1px solid ${tooltipBorder}`,
                                    borderRadius: '8px',
                                }}
                                labelStyle={{ color: textColor }}
                                formatter={(value: number, name: string) => [
                                    formatBytes(value),
                                    name === 'uplink' ? '↑ Uplink' : '↓ Downlink'
                                ]}
                                labelFormatter={(label) => `UE IP: ${label}`}
                            />
                            <Legend />
                            <Bar dataKey="uplink" name="↑ Uplink" fill="#22c55e" stackId="stack" />
                            <Bar dataKey="downlink" name="↓ Downlink" fill="#3b82f6" stackId="stack" />
                        </BarChart>
                    </ResponsiveContainer>
                )}

                {viewMode === 'pie' && (
                    <div className="flex items-center justify-center h-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name.split('.').pop()} (${(percent * 100).toFixed(0)}%)`}
                                    labelLine={{ stroke: axisColor }}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: tooltipBg,
                                        border: `1px solid ${tooltipBorder}`,
                                        borderRadius: '8px',
                                        color: textColor,
                                    }}
                                    itemStyle={{ color: textColor }}
                                    labelStyle={{ color: textColor }}
                                    formatter={(value: number) => [formatBytes(value), 'Traffic']}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {viewMode === 'trend' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                            <XAxis dataKey="time" stroke={axisColor} fontSize={11} />
                            <YAxis
                                stroke={axisColor}
                                fontSize={11}
                                tickFormatter={(value) => formatBytes(value)}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: tooltipBg,
                                    border: `1px solid ${tooltipBorder}`,
                                    borderRadius: '8px',
                                }}
                                labelStyle={{ color: textColor }}
                                formatter={(value: number) => [formatBytes(value)]}
                            />
                            <Legend />
                            {sessions.slice(0, 5).map((session, idx) => (
                                <Line
                                    key={session.seid}
                                    type="monotone"
                                    dataKey={`session${idx}`}
                                    name={session.ue_ip}
                                    stroke={COLORS[idx % COLORS.length]}
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Session Details Table */}
            <div className="mt-4">
                <h4 className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'} mb-2`}>Session Traffic Details</h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className={`${mutedText} border-b ${tableBorder}`}>
                                <th className="text-left py-2 px-2">#</th>
                                <th className="text-left py-2 px-2">UE IP</th>
                                <th className="text-left py-2 px-2">SEID</th>
                                <th className="text-right py-2 px-2">↑ UL Bytes</th>
                                <th className="text-right py-2 px-2">↓ DL Bytes</th>
                                <th className="text-right py-2 px-2">↑ UL Pkts</th>
                                <th className="text-right py-2 px-2">↓ DL Pkts</th>
                                <th className="text-right py-2 px-2">Total</th>
                                <th className="text-center py-2 px-2">Share</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessionData.slice(0, 10).map((session, index) => {
                                const sharePercent = totals.total > 0
                                    ? (session.total / totals.total) * 100
                                    : 0
                                return (
                                    <tr
                                        key={session.seid}
                                        className={`border-b ${tableBorder}/50 ${tableHover}`}
                                    >
                                        <td className="py-2 px-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                            />
                                        </td>
                                        <td className="py-2 px-2 font-mono text-cyan-400">{session.ue_ip}</td>
                                        <td className={`py-2 px-2 font-mono text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>{session.seid}</td>
                                        <td className="py-2 px-2 text-right font-mono text-green-400">
                                            {formatBytes(session.uplink)}
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono text-blue-400">
                                            {formatBytes(session.downlink)}
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono text-green-400/70">
                                            {session.packetsUL.toLocaleString()}
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono text-blue-400/70">
                                            {session.packetsDL.toLocaleString()}
                                        </td>
                                        <td className={`py-2 px-2 text-right font-mono ${textPrimary} font-medium`}>
                                            {formatBytes(session.total)}
                                        </td>
                                        <td className="py-2 px-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`flex-1 h-2 ${progressBg} rounded-full overflow-hidden`}>
                                                    <div
                                                        className="h-full rounded-full transition-all duration-300"
                                                        style={{
                                                            width: `${sharePercent}%`,
                                                            backgroundColor: COLORS[index % COLORS.length]
                                                        }}
                                                    />
                                                </div>
                                                <span className={`text-xs ${mutedText} w-12 text-right`}>
                                                    {sharePercent.toFixed(1)}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {sessions.length > 10 && (
                    <div className={`text-center text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} mt-2`}>
                        Showing top 10 of {sessions.length} sessions
                    </div>
                )}
            </div>
        </div>
    )
}
