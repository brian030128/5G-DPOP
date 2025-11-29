import { DropStats } from '../services/api'

interface DropAlertPanelProps {
    drops: DropStats
}

export default function DropAlertPanel({ drops }: DropAlertPanelProps) {
    const hasDrops = drops.total > 0

    return (
        <div className="space-y-4">
            {/* Summary */}
            <div className={`p-4 rounded-lg ${hasDrops ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                <div className="flex items-center gap-3">
                    <span className={`text-2xl ${hasDrops ? 'pulse-alert' : ''}`}>
                        {hasDrops ? '⚠️' : '✅'}
                    </span>
                    <div>
                        <div className={`font-semibold ${hasDrops ? 'text-red-400' : 'text-green-400'}`}>
                            {hasDrops ? `${drops.total} Drops Detected` : 'No Drops Detected'}
                        </div>
                        <div className="text-sm text-slate-400">
                            Drop Rate: {drops.rate_percent.toFixed(4)}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Drop Reasons Breakdown */}
            {Object.keys(drops.by_reason).length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-slate-300 mb-2">Drop Reasons</h3>
                    <div className="space-y-2">
                        {Object.entries(drops.by_reason).map(([reason, count]) => (
                            <div key={reason} className="flex items-center justify-between">
                                <span className="text-sm text-slate-400">{reason}</span>
                                <span className="text-sm font-mono text-red-400">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Drops Table */}
            <div>
                <h3 className="text-sm font-medium text-slate-300 mb-2">Recent Drop Events</h3>
                {drops.recent_drops.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">
                        No recent drop events
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-400 border-b border-slate-700">
                                    <th className="pb-2 pr-4">Time</th>
                                    <th className="pb-2 pr-4">TEID</th>
                                    <th className="pb-2 pr-4">Reason</th>
                                    <th className="pb-2">Direction</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drops.recent_drops.slice(0, 10).map((drop, idx) => (
                                    <tr key={idx} className="border-b border-slate-700/50 fade-in">
                                        <td className="py-2 pr-4 text-slate-300">
                                            {new Date(drop.timestamp).toLocaleTimeString()}
                                        </td>
                                        <td className="py-2 pr-4 font-mono text-cyan-400">
                                            {drop.teid || 'N/A'}
                                        </td>
                                        <td className="py-2 pr-4">
                                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                                                {drop.reason}
                                            </span>
                                        </td>
                                        <td className="py-2 text-slate-400">
                                            {drop.direction === 'uplink' ? '↑ UL' : '↓ DL'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
