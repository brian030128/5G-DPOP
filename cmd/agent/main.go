package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/solar224/CNDI-Final/internal/ebpf"
)

var (
	// Prometheus metrics
	packetsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "upf_packets_total",
			Help: "Total number of packets processed by UPF",
		},
		[]string{"direction"},
	)

	bytesTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "upf_bytes_total",
			Help: "Total bytes processed by UPF",
		},
		[]string{"direction"},
	)

	packetDropsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "upf_packet_drops_total",
			Help: "Total number of dropped packets",
		},
		[]string{"reason", "direction"},
	)

	activeSessions = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "upf_active_sessions",
			Help: "Number of active PDU sessions",
		},
	)

	// Previous counter values for calculating deltas
	prevUplinkPackets   uint64
	prevDownlinkPackets uint64
	prevUplinkBytes     uint64
	prevDownlinkBytes   uint64
)

func init() {
	prometheus.MustRegister(packetsTotal)
	prometheus.MustRegister(bytesTotal)
	prometheus.MustRegister(packetDropsTotal)
	prometheus.MustRegister(activeSessions)
}

func main() {
	log.Println("============================================================")
	log.Println("    CNDI-Final: UPF Data Plane Observability Agent")
	log.Println("============================================================")

	// Check if running as root
	if os.Geteuid() != 0 {
		log.Fatal("This program must be run as root (for eBPF)")
	}

	// Create eBPF loader
	loader := ebpf.NewLoader()

	// Set up event handler for drops
	loader.OnDropEvent = func(event ebpf.DropEvent) {
		reason := ebpf.FormatDropReason(event.Reason)
		direction := ebpf.FormatDirection(event.Direction)

		log.Printf("[DROP] reason=%s direction=%s teid=0x%x src=%s dst=%s len=%d",
			reason, direction,
			event.TEID,
			ebpf.FormatIP(event.SrcIP),
			ebpf.FormatIP(event.DstIP),
			event.PktLen)

		// Update Prometheus metrics
		packetDropsTotal.WithLabelValues(reason, direction).Inc()
	}

	// Load eBPF programs
	log.Println("Loading eBPF programs...")
	if err := loader.Load(); err != nil {
		log.Fatalf("Failed to load eBPF programs: %v", err)
	}
	defer loader.Close()

	log.Println("[OK] eBPF programs loaded successfully")

	// Start event processing loop
	loader.StartEventLoop()
	log.Println("[OK] Event loop started")

	// Start Prometheus HTTP server
	go func() {
		http.Handle("/metrics", promhttp.Handler())
		http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("OK"))
		})
		log.Println("[INFO] Prometheus metrics server listening on :9100")
		if err := http.ListenAndServe(":9100", nil); err != nil {
			log.Printf("Metrics server error: %v", err)
		}
	}()

	// Start periodic stats collection
	go collectStats(loader)

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	log.Println("[INFO] Agent is running. Press Ctrl+C to stop.")
	log.Println("   Metrics available at http://localhost:9100/metrics")
	log.Println("")

	<-sigChan
	log.Println("\n[INFO] Shutting down...")
}

func collectStats(loader *ebpf.Loader) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		uplink, downlink, err := loader.GetTrafficStats()
		if err != nil {
			log.Printf("Error getting stats: %v", err)
			continue
		}

		// Calculate deltas
		uplinkPktDelta := uplink.Packets - prevUplinkPackets
		downlinkPktDelta := downlink.Packets - prevDownlinkPackets
		uplinkBytesDelta := uplink.Bytes - prevUplinkBytes
		downlinkBytesDelta := downlink.Bytes - prevDownlinkBytes

		// Update previous values
		prevUplinkPackets = uplink.Packets
		prevDownlinkPackets = downlink.Packets
		prevUplinkBytes = uplink.Bytes
		prevDownlinkBytes = downlink.Bytes

		// Update Prometheus counters
		if uplinkPktDelta > 0 {
			packetsTotal.WithLabelValues("uplink").Add(float64(uplinkPktDelta))
			bytesTotal.WithLabelValues("uplink").Add(float64(uplinkBytesDelta))
		}
		if downlinkPktDelta > 0 {
			packetsTotal.WithLabelValues("downlink").Add(float64(downlinkPktDelta))
			bytesTotal.WithLabelValues("downlink").Add(float64(downlinkBytesDelta))
		}

		// Print stats if there's activity
		if uplinkPktDelta > 0 || downlinkPktDelta > 0 {
			fmt.Printf("\rUL: %d pkts (%s)  DL: %d pkts (%s)          ",
				uplink.Packets, formatBytes(uplink.Bytes),
				downlink.Packets, formatBytes(downlink.Bytes))
		}
	}
}

func formatBytes(bytes uint64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)

	switch {
	case bytes >= GB:
		return fmt.Sprintf("%.2f GB", float64(bytes)/GB)
	case bytes >= MB:
		return fmt.Sprintf("%.2f MB", float64(bytes)/MB)
	case bytes >= KB:
		return fmt.Sprintf("%.2f KB", float64(bytes)/KB)
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}
