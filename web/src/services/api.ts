// API Types
export interface TrafficStats {
    uplink: DirectionStats
    downlink: DirectionStats
}

export interface DirectionStats {
    packets: number
    bytes: number
    throughput_mbps: number
    last_updated: string
}

export interface DropStats {
    total: number
    rate_percent: number
    recent_drops: DropEvent[]
    by_reason: Record<string, number>
}

export interface DropEvent {
    timestamp: string
    teid: string
    src_ip: string
    dst_ip: string
    reason: string
    direction: string
    pkt_len: number
}

export interface SessionInfo {
    seid: string
    ue_ip: string
    teids: string[]
    created_at: string
    packets_ul: number
    packets_dl: number
}

// API Functions
const API_BASE = '/api/v1'

export async function fetchHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${API_BASE}/health`)
    if (!response.ok) throw new Error('Health check failed')
    return response.json()
}

export async function fetchTrafficMetrics(): Promise<TrafficStats> {
    const response = await fetch(`${API_BASE}/metrics/traffic`)
    if (!response.ok) throw new Error('Failed to fetch traffic metrics')
    return response.json()
}

export async function fetchDropMetrics(): Promise<DropStats> {
    const response = await fetch(`${API_BASE}/metrics/drops`)
    if (!response.ok) throw new Error('Failed to fetch drop metrics')
    return response.json()
}

export async function fetchSessions(): Promise<{ total: number; sessions: SessionInfo[] }> {
    const response = await fetch(`${API_BASE}/sessions`)
    if (!response.ok) throw new Error('Failed to fetch sessions')
    return response.json()
}

export async function injectFault(type: string, target: string, count: number): Promise<void> {
    const response = await fetch(`${API_BASE}/fault/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, target, count }),
    })
    if (!response.ok) throw new Error('Failed to inject fault')
}

// WebSocket connection helper
export function createMetricsWebSocket(
    onMessage: (data: any) => void,
    onError: (error: Event) => void,
    onClose: () => void
): WebSocket {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/metrics`)

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data)
            onMessage(data)
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
        }
    }

    ws.onerror = onError
    ws.onclose = onClose

    return ws
}
