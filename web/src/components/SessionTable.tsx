import { SessionInfo } from '../services/api'

interface SessionTableProps {
    sessions: SessionInfo[]
}

export default function SessionTable({ sessions }: SessionTableProps) {
    if (sessions.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <div className="text-4xl mb-2">📭</div>
                <p>No active PDU sessions</p>
                <p className="text-sm mt-1">Sessions will appear when UE connects</p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-2 pr-4">SEID</th>
                        <th className="pb-2 pr-4">UE IP</th>
                        <th className="pb-2 pr-4">TEIDs</th>
                        <th className="pb-2 pr-4">UL Pkts</th>
                        <th className="pb-2">DL Pkts</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions.map((session) => (
                        <tr key={session.seid} className="border-b border-slate-700/50">
                            <td className="py-3 pr-4 font-mono text-cyan-400">
                                {session.seid}
                            </td>
                            <td className="py-3 pr-4 font-mono text-slate-300">
                                {session.ue_ip}
                            </td>
                            <td className="py-3 pr-4">
                                <div className="flex flex-wrap gap-1">
                                    {session.teids.map((teid, idx) => (
                                        <span
                                            key={idx}
                                            className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-xs font-mono"
                                        >
                                            {teid}
                                        </span>
                                    ))}
                                </div>
                            </td>
                            <td className="py-3 pr-4 text-green-400">
                                {session.packets_ul.toLocaleString()}
                            </td>
                            <td className="py-3 text-blue-400">
                                {session.packets_dl.toLocaleString()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
