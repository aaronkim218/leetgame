package handlers

import "testing"

func TestParseTrendWindow(t *testing.T) {
	cases := []struct {
		in      string
		days    int
		wantErr bool
	}{
		{"", 30, false},
		{"1m", 30, false},
		{"3m", 90, false},
		{"6m", 180, false},
		{"1y", 365, false},
		{"all", 0, false},
		{"2w", 0, true},
		{"junk", 0, true},
		{"1M", 0, true},
	}
	for _, tc := range cases {
		days, err := parseTrendWindow(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("parseTrendWindow(%q): expected error, got days=%d", tc.in, days)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseTrendWindow(%q): unexpected error: %v", tc.in, err)
			continue
		}
		if days != tc.days {
			t.Errorf("parseTrendWindow(%q) = %d, want %d", tc.in, days, tc.days)
		}
	}
}
