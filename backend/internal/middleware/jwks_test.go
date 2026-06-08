package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"leetgame/internal/middleware"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewKeyfunc_FetchesFromCorrectPath(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys":[]}`))
	}))
	defer srv.Close()

	jwks, err := middleware.NewKeyfunc(srv.URL)
	require.NoError(t, err)
	defer jwks.EndBackground()

	assert.Equal(t, "/auth/v1/.well-known/jwks.json", gotPath)
}
