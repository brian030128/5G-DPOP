import { TrafficStats, DropStats, SessionInfo } from '../services/api'
import TrafficChart from './TrafficChart'
import DropAlertPanel from './DropAlertPanel'
import SessionTable from './SessionTable'
import Topology from './Topology'

interface DashboardProps {
    metrics: TrafficStats
    drops: DropStats
    sessions: SessionInfo[]
}

function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`
    return `${bytes} B`
}

function formatNumber(n: number): string {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return n.toString()
}

export default function Dashboard({ metrics, drops, sessions }: DashboardProps) {
    return (
        <div className="space-y-6 pb-16">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Uplink Card */}
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-sm">Uplink Traffic</span>
                        <span className="text-green-400 text-xs">↑ UL</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                        {metrics.uplink.throughput_mbps.toFixed(2)} Mbps
                    </div>
                    <div className="text-sm text-slate-500">
                        {formatNumber(metrics.uplink.packets)} pkts • {formatBytes(metrics.uplink.bytes)}
                    </div>
                </div>

                {/* Downlink Card */}
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-sm">Downlink Traffic</span>
                        <span className="text-blue-400 text-xs">↓ DL</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                        {metrics.downlink.throughput_mbps.toFixed(2)} Mbps
                    </div>
                    <div className="text-sm text-slate-500">
                        {formatNumber(metrics.downlink.packets)} pkts • {formatBytes(metrics.downlink.bytes)}
                    </div>
                </div>

                {/* Drop Rate Card */}
                <div className={`bg-slate-800/50 rounded-xl p-5 border ${drops.rate_percent > 0 ? 'border-red-500/50 pulse-alert' : 'border-slate-700'
                    }`}>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-sm">Drop Rate</span>
                        <span className={`text-xs ${drops.rate_percent > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {drops.rate_percent > 0 ? '⚠️ Alert' : '✓ OK'}
                        </span>
                    </div>
                    <div className={`text-2xl font-bold mb-1 ${drops.rate_percent > 0 ? 'text-red-400' : 'text-white'
                        }`}>
                        {drops.rate_percent.toFixed(3)}%
                    </div>
                    <div className="text-sm text-slate-500">
                        {formatNumber(drops.total)} total drops
                    </div>
                </div>

                {/* Sessions Card */}
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-sm">Active Sessions</span>
                        <span className="text-cyan-400 text-xs">PDU</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                        {sessions.length}
                    </div>
                    <div className="text-sm text-slate-500">
                        {sessions.reduce((acc, s) => acc + s.teids.length, 0)} active TEIDs
                    </div>
                </div>
            </div>

            {/* Traffic Chart */}
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                <h2 className="text-lg font-semibold text-white mb-4">Live Traffic (Last 60s)</h2>
                <TrafficChart metrics={metrics} />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Drop Alert Panel */}
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <h2 className="text-lg font-semibold text-white mb-4">Drop Events</h2>
                    <DropAlertPanel drops={drops} />
                </div>

                {/* Session Table */}
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <h2 className="text-lg font-semibold text-white mb-4">PDU Sessions (SEID ↔ TEID)</h2>
                    <SessionTable sessions={sessions} />
                </div>
            </div>

            {/* Network Topology */}
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                <h2 className="text-lg font-semibold text-white mb-4">Network Topology</h2>
                <Topology sessions={sessions} drops={drops} />
            </div>
        </div>
    )
}
