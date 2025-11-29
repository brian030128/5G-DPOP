package pfcp

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
)

// PFCP Message Types (3GPP TS 29.244)
const (
	MsgTypeHeartbeatRequest                = 1
	MsgTypeHeartbeatResponse               = 2
	MsgTypeSessionEstablishmentRequest     = 50
	MsgTypeSessionEstablishmentResponse    = 51
	MsgTypeSessionModificationRequest      = 52
	MsgTypeSessionModificationResponse     = 53
	MsgTypeSessionDeletionRequest          = 54
	MsgTypeSessionDeletionResponse         = 55
)

// PFCP IE Types
const (
	IETypeFTEID      = 21  // F-TEID
	IETypePDR        = 1   // Create PDR
	IETypeFAR        = 3   // Create FAR
	IETypePDI        = 2   // PDI
	IETypeSourceIP   = 8   // Source IP Address
	IETypeUEIPAddr   = 93  // UE IP Address
)

// Session represents a PFCP session with its associated TEIDs
type Session struct {
	SEID        uint64
	LocalSEID   uint64
	RemoteSEID  uint64
	UEIP        net.IP
	UPFIP       net.IP
	TEIDs       []uint32 // Associated GTP TEIDs
	CreatedAt   time.Time
	ModifiedAt  time.Time
	PDRCount    int
	FARCount    int
}

// Correlation manages the mapping between sessions and TEIDs
type Correlation struct {
	mu       sync.RWMutex
	sessions map[uint64]*Session // SEID -> Session
	teidMap  map[uint32]uint64   // TEID -> SEID
}

// NewCorrelation creates a new correlation store
func NewCorrelation() *Correlation {
	return &Correlation{
		sessions: make(map[uint64]*Session),
		teidMap:  make(map[uint32]uint64),
	}
}

// AddSession adds or updates a session
func (c *Correlation) AddSession(session *Session) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.sessions[session.SEID] = session
	for _, teid := range session.TEIDs {
		c.teidMap[teid] = session.SEID
	}
}

// RemoveSession removes a session
func (c *Correlation) RemoveSession(seid uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if session, ok := c.sessions[seid]; ok {
		for _, teid := range session.TEIDs {
			delete(c.teidMap, teid)
		}
		delete(c.sessions, seid)
	}
}

// GetSessionByTEID looks up session by TEID
func (c *Correlation) GetSessionByTEID(teid uint32) (*Session, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if seid, ok := c.teidMap[teid]; ok {
		return c.sessions[seid], true
	}
	return nil, false
}

// GetSessionBySEID looks up session by SEID
func (c *Correlation) GetSessionBySEID(seid uint64) (*Session, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	session, ok := c.sessions[seid]
	return session, ok
}

// GetAllSessions returns all sessions
func (c *Correlation) GetAllSessions() []*Session {
	c.mu.RLock()
	defer c.mu.RUnlock()

	sessions := make([]*Session, 0, len(c.sessions))
	for _, s := range c.sessions {
		sessions = append(sessions, s)
	}
	return sessions
}

// SessionCount returns the number of active sessions
func (c *Correlation) SessionCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.sessions)
}

// Sniffer captures and parses PFCP packets
type Sniffer struct {
	handle      *pcap.Handle
	correlation *Correlation
	stopChan    chan struct{}
	iface       string
	port        uint16
}

// NewSniffer creates a new PFCP sniffer
func NewSniffer(iface string, port uint16, correlation *Correlation) *Sniffer {
	return &Sniffer{
		iface:       iface,
		port:        port,
		correlation: correlation,
		stopChan:    make(chan struct{}),
	}
}

// Start begins capturing PFCP packets
func (s *Sniffer) Start() error {
	var err error

	// Open the device for capturing
	s.handle, err = pcap.OpenLive(s.iface, 65535, true, pcap.BlockForever)
	if err != nil {
		return fmt.Errorf("failed to open device %s: %w", s.iface, err)
	}

	// Set BPF filter for PFCP (UDP port 8805)
	filter := fmt.Sprintf("udp port %d", s.port)
	if err := s.handle.SetBPFFilter(filter); err != nil {
		return fmt.Errorf("failed to set BPF filter: %w", err)
	}

	log.Printf("PFCP Sniffer started on %s, filter: %s", s.iface, filter)

	go s.captureLoop()

	return nil
}

// Stop stops the sniffer
func (s *Sniffer) Stop() {
	close(s.stopChan)
	if s.handle != nil {
		s.handle.Close()
	}
}

func (s *Sniffer) captureLoop() {
	packetSource := gopacket.NewPacketSource(s.handle, s.handle.LinkType())

	for {
		select {
		case <-s.stopChan:
			return
		case packet := <-packetSource.Packets():
			s.processPacket(packet)
		}
	}
}

func (s *Sniffer) processPacket(packet gopacket.Packet) {
	// Get UDP layer
	udpLayer := packet.Layer(layers.LayerTypeUDP)
	if udpLayer == nil {
		return
	}

	udp, _ := udpLayer.(*layers.UDP)
	payload := udp.Payload

	if len(payload) < 8 {
		return
	}

	// Parse PFCP header
	msgType := payload[1]
	msgLen := binary.BigEndian.Uint16(payload[2:4])

	// Check if it's a session message (has SEID)
	hasSessionID := (payload[0] & 0x01) != 0

	var seid uint64
	var ieOffset int

	if hasSessionID {
		if len(payload) < 16 {
			return
		}
		seid = binary.BigEndian.Uint64(payload[4:12])
		ieOffset = 16
	} else {
		ieOffset = 8
	}

	// Process based on message type
	switch msgType {
	case MsgTypeSessionEstablishmentRequest:
		s.handleSessionEstablishment(seid, payload[ieOffset:int(msgLen)+4])
	case MsgTypeSessionModificationRequest:
		s.handleSessionModification(seid, payload[ieOffset:int(msgLen)+4])
	case MsgTypeSessionDeletionRequest:
		s.handleSessionDeletion(seid)
	}
}

func (s *Sniffer) handleSessionEstablishment(seid uint64, ieData []byte) {
	log.Printf("📥 PFCP Session Establishment: SEID=0x%x", seid)

	session := &Session{
		SEID:      seid,
		CreatedAt: time.Now(),
		TEIDs:     make([]uint32, 0),
	}

	// Parse IEs to extract TEIDs
	teids := s.extractTEIDs(ieData)
	session.TEIDs = teids

	// Extract UE IP if present
	ueIP := s.extractUEIP(ieData)
	if ueIP != nil {
		session.UEIP = ueIP
	}

	s.correlation.AddSession(session)

	log.Printf("   └─ TEIDs: %v, UE_IP: %v", teids, ueIP)
}

func (s *Sniffer) handleSessionModification(seid uint64, ieData []byte) {
	log.Printf("📝 PFCP Session Modification: SEID=0x%x", seid)

	session, ok := s.correlation.GetSessionBySEID(seid)
	if !ok {
		log.Printf("   └─ Session not found (new session?)")
		return
	}

	// Extract new TEIDs if any
	newTEIDs := s.extractTEIDs(ieData)
	if len(newTEIDs) > 0 {
		session.TEIDs = append(session.TEIDs, newTEIDs...)
		session.ModifiedAt = time.Now()
		s.correlation.AddSession(session)
		log.Printf("   └─ New TEIDs: %v", newTEIDs)
	}
}

func (s *Sniffer) handleSessionDeletion(seid uint64) {
	log.Printf("🗑️  PFCP Session Deletion: SEID=0x%x", seid)
	s.correlation.RemoveSession(seid)
}

func (s *Sniffer) extractTEIDs(ieData []byte) []uint32 {
	teids := make([]uint32, 0)
	offset := 0

	for offset < len(ieData)-4 {
		if offset+4 > len(ieData) {
			break
		}

		ieType := binary.BigEndian.Uint16(ieData[offset : offset+2])
		ieLen := binary.BigEndian.Uint16(ieData[offset+2 : offset+4])

		if offset+4+int(ieLen) > len(ieData) {
			break
		}

		ieValue := ieData[offset+4 : offset+4+int(ieLen)]

		// F-TEID IE
		if ieType == IETypeFTEID && len(ieValue) >= 5 {
			// First byte is flags, next 4 bytes is TEID
			teid := binary.BigEndian.Uint32(ieValue[1:5])
			teids = append(teids, teid)
		}

		offset += 4 + int(ieLen)
	}

	return teids
}

func (s *Sniffer) extractUEIP(ieData []byte) net.IP {
	offset := 0

	for offset < len(ieData)-4 {
		if offset+4 > len(ieData) {
			break
		}

		ieType := binary.BigEndian.Uint16(ieData[offset : offset+2])
		ieLen := binary.BigEndian.Uint16(ieData[offset+2 : offset+4])

		if offset+4+int(ieLen) > len(ieData) {
			break
		}

		ieValue := ieData[offset+4 : offset+4+int(ieLen)]

		// UE IP Address IE
		if ieType == IETypeUEIPAddr && len(ieValue) >= 5 {
			// First byte is flags, check for IPv4
			if ieValue[0]&0x02 != 0 { // IPv4 present
				return net.IP(ieValue[1:5])
			}
		}

		offset += 4 + int(ieLen)
	}

	return nil
}

// GetCorrelation returns the correlation store
func (s *Sniffer) GetCorrelation() *Correlation {
	return s.correlation
}
