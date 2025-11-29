import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import { useMetrics } from './hooks/useMetrics'

function App() {
    const { metrics, drops, sessions, connected, error } = useMetrics()
    const [systemStatus, setSystemStatus] = useState<'online' | 'offline' | 'warning'>('offline')

    useEffect(() => {
        if (connected && !error) {
            setSystemStatus('online')
        } else if (error) {
            setSystemStatus('warning')
        } else {
            setSystemStatus('offline')
        }
    }, [connected, error])

    return (
        <div className="min-h-screen bg-cndi-dark">
            {/* Header */}
            <header className="bg-slate-800/50 border-b border-slate-700 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-lg">5G</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">CNDI-Final</h1>
                            <p className="text-sm text-slate-400">UPF Data Plane Observability</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${systemStatus === 'online' ? 'bg-green-500' :
                                    systemStatus === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                                }`} />
                            <span className="text-sm text-slate-300">
                                {systemStatus === 'online' ? 'System Online' :
                                    systemStatus === 'warning' ? 'Partial Connection' : 'Offline'}
                            </span>
                        </div>
                        <div className="text-sm text-slate-400">
                            {new Date().toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="p-6">
                {error && (
                    <div className="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
                        ⚠️ Connection Error: {error}. Make sure the API server is running.
                    </div>
                )}

                <Dashboard
                    metrics={metrics}
                    drops={drops}
                    sessions={sessions}
                />
            </main>

            {/* Footer */}
            <footer className="fixed bottom-0 left-0 right-0 bg-slate-800/50 border-t border-slate-700 px-6 py-2">
                <div className="flex items-center justify-between text-sm text-slate-400">
                    <span>free5GC v4.1.0 | gtp5g Kernel Module</span>
                    <span>WebSocket: {connected ? '🟢 Connected' : '🔴 Disconnected'}</span>
                </div>
            </footer>
        </div>
    )
}

export default App
