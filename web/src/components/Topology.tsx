import { SessionInfo, DropStats } from '../services/api'

interface TopologyProps {
    sessions: SessionInfo[]
    drops: DropStats
}

export default function Topology({ sessions, drops }: TopologyProps) {
    const hasDrops = drops.total > 0
    const hasActiveSessions = sessions.length > 0

    return (
        <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-4 flex-wrap justify-center">
                {/* UE */}
                <div className="flex flex-col items-center">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl ${hasActiveSessions ? 'bg-green-500/20 border-2 border-green-500' : 'bg-slate-700 border-2 border-slate-600'
                        }`}>
                        📱
                    </div>
                    <span className="mt-2 text-sm text-slate-400">UE</span>
                    {sessions.length > 0 && (
                        <span className="text-xs text-slate-500">{sessions[0]?.ue_ip || ''}</span>
                    )}
                </div>

                {/* Connection Line */}
                <div className="flex items-center">
                    <div className={`w-12 h-1 ${hasActiveSessions ? 'bg-green-500' : 'bg-slate-600'}`} />
                    <span className="text-slate-500 text-xs px-2">N1/N2</span>
                    <div className={`w-12 h-1 ${hasActiveSessions ? 'bg-green-500' : 'bg-slate-600'}`} />
                </div>

                {/* gNB */}
                <div className="flex flex-col items-center">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl ${hasActiveSessions ? 'bg-green-500/20 border-2 border-green-500' : 'bg-slate-700 border-2 border-slate-600'
                        }`}>
                        📡
                    </div>
                    <span className="mt-2 text-sm text-slate-400">gNB</span>
                    <span className="text-xs text-slate-500">UERANSIM</span>
                </div>

                {/* Connection Line N3 */}
                <div className="flex items-center">
                    <div className={`w-12 h-1 ${hasActiveSessions ? 'bg-green-500' : 'bg-slate-600'}`} />
                    <div className="flex flex-col items-center px-2">
                        <span className="text-slate-500 text-xs">N3</span>
                        <span className="text-slate-500 text-xs">GTP-U</span>
                    </div>
                    <div className={`w-12 h-1 ${hasActiveSessions ? 'bg-green-500' : 'bg-slate-600'}`} />
                </div>

                {/* UPF - Main Focus */}
                <div className="flex flex-col items-center relative">
                    <div className={`w-20 h-20 rounded-xl flex items-center justify-center text-2xl border-2 ${hasDrops
                            ? 'bg-red-500/20 border-red-500 pulse-alert'
                            : hasActiveSessions
                                ? 'bg-blue-500/20 border-blue-500'
                                : 'bg-slate-700 border-slate-600'
                        }`}>
                        🖥️
                    </div>
                    <span className="mt-2 text-sm font-semibold text-white">UPF</span>
                    <span className="text-xs text-slate-500">free5GC</span>
                    {hasDrops && (
                        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                            ⚠️ DROP
                        </div>
                    )}
                </div>

                {/* Connection Line N6 */}
                <div className="flex items-center">
                    <div className={`w-12 h-1 ${hasActiveSessions ? 'bg-green-500' : 'bg-slate-600'}`} />
                    <span className="text-slate-500 text-xs px-2">N6</span>
                    <div className={`w-12 h-1 ${hasActiveSessions ? 'bg-green-500' : 'bg-slate-600'}`} />
                </div>

                {/* DN */}
                <div className="flex flex-col items-center">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl ${hasActiveSessions ? 'bg-green-500/20 border-2 border-green-500' : 'bg-slate-700 border-2 border-slate-600'
                        }`}>
                        🌐
                    </div>
                    <span className="mt-2 text-sm text-slate-400">DN</span>
                    <span className="text-xs text-slate-500">Internet</span>
                </div>
            </div>
        </div>
    )
}
