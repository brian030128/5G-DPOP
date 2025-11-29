// go:build ignore

// upf_monitor.bpf.c - eBPF program to monitor gtp5g kernel module
// This program hooks into gtp5g functions to collect traffic statistics
// and detect packet drops.

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_endian.h>

// Constants
#define ETH_P_IP 0x0800
#define IPPROTO_UDP 17
#define GTP_U_PORT 2152

// Traffic direction
#define DIRECTION_UPLINK 0
#define DIRECTION_DOWNLINK 1

// Drop reasons
#define DROP_REASON_NO_PDR 0
#define DROP_REASON_INVALID_TEID 1
#define DROP_REASON_QOS 2
#define DROP_REASON_KERNEL 3

// ============================================================================
// Data Structures
// ============================================================================

// Traffic counter structure
struct traffic_counter
{
    __u64 packets;
    __u64 bytes;
    __u64 timestamp;
};

// Drop event structure (sent to userspace via ring buffer)
struct drop_event
{
    __u64 timestamp;
    __u32 teid;
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u32 pkt_len;
    __u8 reason;
    __u8 direction;
    __u8 pad[2];
};

// Packet event structure (for detailed tracing)
struct packet_event
{
    __u64 timestamp;
    __u32 teid;
    __u32 src_ip;
    __u32 dst_ip;
    __u32 pkt_len;
    __u8 direction;
    __u8 qfi;
    __u8 pad[2];
};

// Session info (populated from userspace via PFCP sniffer)
struct session_info
{
    __u64 seid;
    __u32 ue_ip;
    __u32 upf_ip;
    __u64 created_at;
};

// ============================================================================
// BPF Maps
// ============================================================================

// Per-CPU traffic counters (avoids lock contention)
// Key: 0 = uplink, 1 = downlink
struct
{
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 2);
    __type(key, __u32);
    __type(value, struct traffic_counter);
} traffic_stats SEC(".maps");

// Ring buffer for drop events (sent to userspace)
struct
{
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 256 * 1024); // 256KB
} drop_events SEC(".maps");

// Ring buffer for packet events (optional detailed tracing)
struct
{
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 512 * 1024); // 512KB
} packet_events SEC(".maps");

// TEID to Session mapping (populated from userspace)
struct
{
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 4096);
    __type(key, __u32); // TEID
    __type(value, struct session_info);
} teid_session_map SEC(".maps");

// Per-TEID counters
struct
{
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 4096);
    __type(key, __u32); // TEID
    __type(value, struct traffic_counter);
} teid_stats SEC(".maps");

// Configuration flags (set from userspace)
struct
{
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 4);
    __type(key, __u32);
    __type(value, __u32);
} agent_config SEC(".maps");

// ============================================================================
// Helper Functions
// ============================================================================

static __always_inline void update_traffic_counter(__u32 direction, __u32 len)
{
    struct traffic_counter *counter;

    counter = bpf_map_lookup_elem(&traffic_stats, &direction);
    if (counter)
    {
        counter->packets++;
        counter->bytes += len;
        counter->timestamp = bpf_ktime_get_ns();
    }
}

static __always_inline void update_teid_counter(__u32 teid, __u32 len)
{
    struct traffic_counter *counter;
    struct traffic_counter new_counter = {0};

    counter = bpf_map_lookup_elem(&teid_stats, &teid);
    if (counter)
    {
        counter->packets++;
        counter->bytes += len;
        counter->timestamp = bpf_ktime_get_ns();
    }
    else
    {
        new_counter.packets = 1;
        new_counter.bytes = len;
        new_counter.timestamp = bpf_ktime_get_ns();
        bpf_map_update_elem(&teid_stats, &teid, &new_counter, BPF_ANY);
    }
}

static __always_inline void emit_drop_event(__u32 teid, __u32 src_ip, __u32 dst_ip,
                                            __u32 pkt_len, __u8 reason, __u8 direction)
{
    struct drop_event *event;

    event = bpf_ringbuf_reserve(&drop_events, sizeof(*event), 0);
    if (!event)
    {
        return;
    }

    event->timestamp = bpf_ktime_get_ns();
    event->teid = teid;
    event->src_ip = src_ip;
    event->dst_ip = dst_ip;
    event->pkt_len = pkt_len;
    event->reason = reason;
    event->direction = direction;
    event->src_port = 0;
    event->dst_port = 0;

    bpf_ringbuf_submit(event, 0);
}

static __always_inline void emit_packet_event(__u32 teid, __u32 src_ip, __u32 dst_ip,
                                              __u32 pkt_len, __u8 direction, __u8 qfi)
{
    struct packet_event *event;

    // Check if detailed tracing is enabled
    __u32 key = 0; // config key for detailed_tracing
    __u32 *enabled = bpf_map_lookup_elem(&agent_config, &key);
    if (!enabled || *enabled == 0)
    {
        return;
    }

    event = bpf_ringbuf_reserve(&packet_events, sizeof(*event), 0);
    if (!event)
    {
        return;
    }

    event->timestamp = bpf_ktime_get_ns();
    event->teid = teid;
    event->src_ip = src_ip;
    event->dst_ip = dst_ip;
    event->pkt_len = pkt_len;
    event->direction = direction;
    event->qfi = qfi;

    bpf_ringbuf_submit(event, 0);
}

// ============================================================================
// Kprobes - Hook gtp5g functions
// ============================================================================

// Hook: gtp5g_encap_recv - Entry point for uplink packets
// This function is called when a GTP-U packet is received on the UDP socket
SEC("kprobe/gtp5g_encap_recv")
int BPF_KPROBE(kprobe_gtp5g_encap_recv, struct sock *sk, struct sk_buff *skb)
{
    __u32 len;

    if (!skb)
    {
        return 0;
    }

    // Read packet length
    len = BPF_CORE_READ(skb, len);

    // Update uplink counter
    update_traffic_counter(DIRECTION_UPLINK, len);

    // TODO: Extract TEID from GTP header
    // The GTP-U header starts after UDP header
    // TEID is at offset 4 of the GTP header (4 bytes)

    return 0;
}

// Hook: gtp5g_dev_xmit - Entry point for downlink packets
// This function is called when a packet is transmitted through upfgtp interface
SEC("kprobe/gtp5g_dev_xmit")
int BPF_KPROBE(kprobe_gtp5g_dev_xmit, struct sk_buff *skb, struct net_device *dev)
{
    __u32 len;

    if (!skb)
    {
        return 0;
    }

    // Read packet length
    len = BPF_CORE_READ(skb, len);

    // Update downlink counter
    update_traffic_counter(DIRECTION_DOWNLINK, len);

    return 0;
}

// Hook: kfree_skb tracepoint - Detect packet drops
// This tracepoint fires whenever a packet is dropped in the kernel
// NOTE: This is disabled by default as it's too noisy. Enable via agent_config.
SEC("tracepoint/skb/kfree_skb")
int tracepoint_kfree_skb(struct trace_event_raw_kfree_skb *ctx)
{
    struct sk_buff *skb;
    void *location;
    __u32 len;

    // Check if drop tracing is enabled (config key 1)
    __u32 key = 1;
    __u32 *enabled = bpf_map_lookup_elem(&agent_config, &key);
    if (!enabled || *enabled == 0)
    {
        return 0;
    }

    skb = (struct sk_buff *)ctx->skbaddr;
    location = (void *)ctx->location;

    if (!skb)
    {
        return 0;
    }

    // Read packet length
    len = BPF_CORE_READ(skb, len);

    // Only emit if packet has meaningful length (filter noise)
    if (len < 20)
    {
        return 0;
    }

    emit_drop_event(0, 0, 0, len, DROP_REASON_KERNEL, 0);

    return 0;
}

// ============================================================================
// License
// ============================================================================

char LICENSE[] SEC("license") = "GPL";
