package main

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// TrafficStats represents traffic statistics
type TrafficStats struct {
	Uplink   DirectionStats `json:"uplink"`
	Downlink DirectionStats `json:"downlink"`
}

// DirectionStats represents stats for a single direction
type DirectionStats struct {
	Packets     uint64  `json:"packets"`
	Bytes       uint64  `json:"bytes"`
	Throughput  float64 `json:"throughput_mbps"`
	LastUpdated string  `json:"last_updated"`
}

// DropStats represents drop statistics
type DropStats struct {
	Total        uint64       `json:"total"`
	Rate         float64      `json:"rate_percent"`
	RecentDrops  []DropEvent  `json:"recent_drops"`
	ByReason     map[string]uint64 `json:"by_reason"`
}

// DropEvent represents a single drop event
type DropEvent struct {
	Timestamp string `json:"timestamp"`
	TEID      string `json:"teid"`
	SrcIP     string `json:"src_ip"`
	DstIP     string `json:"dst_ip"`
	Reason    string `json:"reason"`
	Direction string `json:"direction"`
	PktLen    uint32 `json:"pkt_len"`
}

// SessionInfo represents a PDU session
type SessionInfo struct {
	SEID       string   `json:"seid"`
	UEIP       string   `json:"ue_ip"`
	TEIDs      []string `json:"teids"`
	CreatedAt  string   `json:"created_at"`
	PacketsUL  uint64   `json:"packets_ul"`
	PacketsDL  uint64   `json:"packets_dl"`
}

// Server represents the API server
type Server struct {
	router     *gin.Engine
	upgrader   websocket.Upgrader
	clients    map[*websocket.Conn]bool
	clientsMu  sync.Mutex
	broadcast  chan interface{}
	
	// In-memory stats (will be replaced with Prometheus queries)
	stats      TrafficStats
	drops      DropStats
	sessions   []SessionInfo
	statsMu    sync.RWMutex
}

func main() {
	log.Println("============================================================")
	log.Println("    CNDI-Final: Backend API Server")
	log.Println("============================================================")

	server := NewServer()
	
	log.Println("[INFO] Starting API server on :8080")
	if err := server.Run(":8080"); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// NewServer creates a new API server
func NewServer() *Server {
	s := &Server{
		router:    gin.Default(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins for development
			},
		},
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan interface{}),
		drops: DropStats{
			RecentDrops: make([]DropEvent, 0),
			ByReason:    make(map[string]uint64),
		},
		sessions: make([]SessionInfo, 0),
	}

	s.setupRoutes()
	go s.handleBroadcast()

	return s
}

func (s *Server) setupRoutes() {
	// CORS middleware
	s.router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// API routes
	api := s.router.Group("/api/v1")
	{
		api.GET("/health", s.handleHealth)
		api.GET("/metrics/traffic", s.handleTrafficMetrics)
		api.GET("/metrics/drops", s.handleDropMetrics)
		api.GET("/sessions", s.handleSessions)
		api.GET("/sessions/:seid", s.handleSessionDetail)
		api.POST("/fault/inject", s.handleFaultInject)
	}

	// WebSocket for real-time updates
	s.router.GET("/ws/metrics", s.handleWebSocket)
	s.router.GET("/ws/events", s.handleEventsWebSocket)
}

// Health check
func (s *Server) handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"timestamp": time.Now().Format(time.RFC3339),
		"version": "1.0.0",
	})
}

// Traffic metrics
func (s *Server) handleTrafficMetrics(c *gin.Context) {
	s.statsMu.RLock()
	defer s.statsMu.RUnlock()

	c.JSON(http.StatusOK, s.stats)
}

// Drop metrics
func (s *Server) handleDropMetrics(c *gin.Context) {
	s.statsMu.RLock()
	defer s.statsMu.RUnlock()

	c.JSON(http.StatusOK, s.drops)
}

// Sessions list
func (s *Server) handleSessions(c *gin.Context) {
	s.statsMu.RLock()
	defer s.statsMu.RUnlock()

	c.JSON(http.StatusOK, gin.H{
		"total":    len(s.sessions),
		"sessions": s.sessions,
	})
}

// Session detail
func (s *Server) handleSessionDetail(c *gin.Context) {
	seid := c.Param("seid")
	
	s.statsMu.RLock()
	defer s.statsMu.RUnlock()

	for _, session := range s.sessions {
		if session.SEID == seid {
			c.JSON(http.StatusOK, session)
			return
		}
	}

	c.JSON(http.StatusNotFound, gin.H{
		"error": "session not found",
	})
}

// Fault injection
func (s *Server) handleFaultInject(c *gin.Context) {
	var req struct {
		Type   string `json:"type"`   // "invalid_teid", "no_pdr"
		Target string `json:"target"` // Target TEID or IP
		Count  int    `json:"count"`  // Number of packets
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: Implement actual fault injection
	log.Printf("[FAULT] Injection requested: type=%s, target=%s, count=%d",
		req.Type, req.Target, req.Count)

	c.JSON(http.StatusOK, gin.H{
		"status": "injection_started",
		"type":   req.Type,
		"target": req.Target,
	})
}

// WebSocket handler for real-time metrics
func (s *Server) handleWebSocket(c *gin.Context) {
	conn, err := s.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	s.clientsMu.Lock()
	s.clients[conn] = true
	s.clientsMu.Unlock()

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
		conn.Close()
	}()

	// Send initial data
	s.statsMu.RLock()
	conn.WriteJSON(gin.H{
		"type": "initial",
		"data": gin.H{
			"traffic":  s.stats,
			"drops":    s.drops,
			"sessions": len(s.sessions),
		},
	})
	s.statsMu.RUnlock()

	// Keep connection alive and handle client messages
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// WebSocket handler for events
func (s *Server) handleEventsWebSocket(c *gin.Context) {
	conn, err := s.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	s.clientsMu.Lock()
	s.clients[conn] = true
	s.clientsMu.Unlock()

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
		conn.Close()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// Broadcast updates to all WebSocket clients
func (s *Server) handleBroadcast() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.statsMu.RLock()
			msg := gin.H{
				"type": "update",
				"data": gin.H{
					"traffic":  s.stats,
					"drops":    s.drops,
					"sessions": len(s.sessions),
				},
				"timestamp": time.Now().Format(time.RFC3339),
			}
			s.statsMu.RUnlock()

			s.clientsMu.Lock()
			for client := range s.clients {
				if err := client.WriteJSON(msg); err != nil {
					client.Close()
					delete(s.clients, client)
				}
			}
			s.clientsMu.Unlock()
		}
	}
}

// UpdateStats updates the traffic statistics (called from agent)
func (s *Server) UpdateStats(stats TrafficStats) {
	s.statsMu.Lock()
	s.stats = stats
	s.statsMu.Unlock()
}

// AddDropEvent adds a drop event
func (s *Server) AddDropEvent(event DropEvent) {
	s.statsMu.Lock()
	defer s.statsMu.Unlock()

	s.drops.Total++
	s.drops.RecentDrops = append([]DropEvent{event}, s.drops.RecentDrops...)
	
	// Keep only last 100 events
	if len(s.drops.RecentDrops) > 100 {
		s.drops.RecentDrops = s.drops.RecentDrops[:100]
	}

	s.drops.ByReason[event.Reason]++
}

// Run starts the server
func (s *Server) Run(addr string) error {
	return s.router.Run(addr)
}
