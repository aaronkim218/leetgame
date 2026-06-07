package llm

import (
	"context"
	"strings"
)

// minEndMarkerLen is the length of the shortest possible end-marker sequence:
// closing quote + comma + "stage" key = `","stage"` (8 chars).
// The pending buffer is kept at this length - 1 so we never emit a partial marker.
const minEndMarkerLen = 8

type extractState int

const (
	stateBefore  extractState = iota // waiting to see the message prefix
	stateMessage                     // inside the message value, forwarding tokens
	stateAfter                       // past the message value, discarding
)

// Extractor pulls the clean message value out of a streaming JSON response.
// The LLM emits some form of {"message": "CONTENT", "stage": "VALUE"} token
// by token — possibly compact, pretty-printed, or wrapped in a code fence.
// It calls onToken only with characters that belong to CONTENT.
type Extractor struct {
	accumulated string
	pending     string // trailing buffer to detect end marker before forwarding
	state       extractState
	onToken     func(string)
}

func NewExtractor(onToken func(string)) *Extractor {
	return &Extractor{onToken: onToken}
}

// findMsgValueStart searches s for the "message" key and returns the index
// of the first character of the message value (i.e. the char after the
// opening `"` of the string value). Returns -1 if not yet found.
func findMsgValueStart(s string) int {
	idx := strings.Index(s, `"message"`)
	if idx < 0 {
		return -1
	}
	rest := s[idx+9:] // skip `"message"` (9 chars)
	// skip whitespace
	i := 0
	for i < len(rest) && isWS(rest[i]) {
		i++
	}
	if i >= len(rest) || rest[i] != ':' {
		return -1
	}
	i++ // skip colon
	for i < len(rest) && isWS(rest[i]) {
		i++
	}
	if i >= len(rest) || rest[i] != '"' {
		return -1
	}
	return idx + 9 + i + 1 // position right after the opening quote
}

func isWS(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r'
}

// findEndMarker returns the index of the closing `"` that ends the message
// value (i.e. the quote followed by `,` then optional whitespace then `"stage"`).
// Returns -1 if not found.
func findEndMarker(s string) int {
	for i := 0; i+8 <= len(s); i++ {
		if s[i] != '"' {
			continue
		}
		j := i + 1
		if j >= len(s) || s[j] != ',' {
			continue
		}
		j++
		for j < len(s) && isWS(s[j]) {
			j++
		}
		if j+7 <= len(s) && s[j:j+7] == `"stage"` {
			return i
		}
	}
	return -1
}

// Add feeds the next token into the extractor.
func (e *Extractor) Add(tok string) {
	e.accumulated += tok
	if e.state == stateAfter {
		return
	}
	if e.state == stateBefore {
		// Strip leading code fence (```json\n or ```\n) before scanning.
		content := e.accumulated
		if strings.HasPrefix(content, "```") {
			if idx := strings.Index(content, "\n"); idx >= 0 {
				content = content[idx+1:]
			}
		}
		start := findMsgValueStart(content)
		if start >= 0 {
			e.state = stateMessage
			after := content[start:]
			if after != "" {
				e.forward(after)
			}
		}
		return
	}
	e.forward(tok)
}

// Flush emits any trailing buffered content. Call after the stream ends.
func (e *Extractor) Flush(ctx context.Context) {
	if e.state == stateMessage && e.pending != "" && e.onToken != nil && ctx.Err() == nil {
		e.onToken(e.pending)
		e.pending = ""
	}
}

// forward sends tok through the trailing buffer so the end marker is always
// detected before any part of it is forwarded to onToken.
func (e *Extractor) forward(tok string) {
	combined := e.pending + tok
	if idx := findEndMarker(combined); idx >= 0 {
		if e.onToken != nil && idx > 0 {
			e.onToken(combined[:idx])
		}
		e.state = stateAfter
		e.pending = ""
		return
	}
	safeLen := len(combined) - minEndMarkerLen + 1
	if safeLen > 0 {
		if e.onToken != nil {
			e.onToken(combined[:safeLen])
		}
		e.pending = combined[safeLen:]
	} else {
		e.pending = combined
	}
}

// StripCodeFence removes an opening ```json or ``` fence and its closing ``` from s.
func StripCodeFence(s string) string {
	if !strings.HasPrefix(s, "```") {
		return s
	}
	if idx := strings.Index(s, "\n"); idx >= 0 {
		s = s[idx+1:]
	} else {
		// fence with no newline — strip the opening marker directly
		s = strings.TrimPrefix(s, "```json")
		s = strings.TrimPrefix(s, "```")
	}
	if idx := strings.LastIndex(s, "```"); idx >= 0 {
		s = strings.TrimSpace(s[:idx])
	}
	return s
}
