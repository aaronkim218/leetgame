package middleware_test

import (
	"crypto/rand"
	"crypto/rsa"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"leetgame/internal/middleware"
	"leetgame/internal/xcontext"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// makeTestKeyfunc generates an RSA-2048 key pair and returns a jwt.Keyfunc
// that accepts RS256 tokens signed with the corresponding private key.
func makeTestKeyfunc(t *testing.T) (*rsa.PrivateKey, jwt.Keyfunc) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	kf := func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return &privateKey.PublicKey, nil
	}
	return privateKey, kf
}

// makeToken creates an RS256-signed JWT with the given sub and expiry.
func makeToken(t *testing.T, privateKey *rsa.PrivateKey, sub string, expiry time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub": sub,
		"exp": jwt.NewNumericDate(expiry),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := token.SignedString(privateKey)
	require.NoError(t, err)
	return signed
}

// makeHMACToken creates an HS256-signed JWT — used only to test wrong-algorithm rejection.
func makeHMACToken(t *testing.T, sub string, expiry time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub": sub,
		"exp": jwt.NewNumericDate(expiry),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte("some-hmac-secret"))
	require.NoError(t, err)
	return signed
}

func makeOptionalApp(kf jwt.Keyfunc) *fiber.App {
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			return c.Status(http.StatusUnauthorized).SendString("unauthorized")
		},
	})
	app.Use(middleware.OptionalAuth(kf))
	return app
}

func TestRequireAuth_ValidToken(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := fiber.New()
	app.Use(middleware.RequireAuth(kf))
	uid := uuid.New()
	app.Get("/test", func(c fiber.Ctx) error {
		got, err := xcontext.GetUserID(c)
		require.NoError(t, err)
		assert.Equal(t, uid, got)
		return c.SendStatus(http.StatusOK)
	})

	token := makeToken(t, privateKey, uid.String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestRequireAuth_MissingHeader(t *testing.T) {
	_, kf := makeTestKeyfunc(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			return c.Status(http.StatusUnauthorized).SendString("unauthorized")
		},
	})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_ExpiredToken(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			return c.Status(http.StatusUnauthorized).SendString("unauthorized")
		},
	})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, uuid.New().String(), time.Now().Add(-time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_InvalidSignature(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			return c.Status(http.StatusUnauthorized).SendString("unauthorized")
		},
	})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, uuid.New().String(), time.Now().Add(time.Hour))
	token = token[:len(token)-4] + "xxxx"

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_NonUUIDSub(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			return c.Status(http.StatusUnauthorized).SendString("unauthorized")
		},
	})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, "not-a-uuid", time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_WrongAlgorithm(t *testing.T) {
	_, kf := makeTestKeyfunc(t) // RS256 keyfunc
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			return c.Status(http.StatusUnauthorized).SendString("unauthorized")
		},
	})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	// HS256 token is the wrong algorithm for an RS256 keyfunc
	token := makeHMACToken(t, uuid.New().String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// OptionalAuth tests — all cases must pass through with 200, never return 401.

func TestOptionalAuth_NilKeyfunc(t *testing.T) {
	app := makeOptionalApp(nil)
	app.Get("/test", func(c fiber.Ctx) error {
		_, err := xcontext.GetUserID(c)
		assert.Error(t, err, "user ID should not be set when keyfunc is nil")
		return c.SendStatus(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_NoHeader(t *testing.T) {
	_, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	app.Get("/test", func(c fiber.Ctx) error {
		_, err := xcontext.GetUserID(c)
		assert.Error(t, err, "user ID should not be set for unauthenticated request")
		return c.SendStatus(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_ValidToken(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	uid := uuid.New()
	app.Get("/test", func(c fiber.Ctx) error {
		got, err := xcontext.GetUserID(c)
		require.NoError(t, err)
		assert.Equal(t, uid, got)
		return c.SendStatus(http.StatusOK)
	})

	token := makeToken(t, privateKey, uid.String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_ExpiredToken(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, uuid.New().String(), time.Now().Add(-time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_InvalidSignature(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, uuid.New().String(), time.Now().Add(time.Hour))
	token = token[:len(token)-4] + "xxxx"

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_NonUUIDSub(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, "not-a-uuid", time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_WrongAlgorithm(t *testing.T) {
	_, kf := makeTestKeyfunc(t) // RS256 keyfunc
	app := makeOptionalApp(kf)
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	// HS256 token is wrong algorithm — OptionalAuth silently passes through
	token := makeHMACToken(t, uuid.New().String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
