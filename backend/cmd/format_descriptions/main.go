package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

const model = "claude-haiku-4-5"

const systemPrompt = `You are a text formatter. Convert a plain-text LeetCode problem description to clean markdown.

Rules:
- Preserve all content exactly — do not add, remove, or rephrase anything
- Do NOT add any title, heading, or text that is not in the original — no # headers, no introductory lines
- Use backticks for variable names, array literals, function names, and values (e.g. ` + "`root`" + `, ` + "`[1,2,3]`" + `, ` + "`true`" + `, ` + "`false`" + `)
- Always put Input and Output values in backticks (e.g. Input: ` + "`nums = [1,2,3]`" + `, Output: ` + "`4`" + `)
- Use **bold** for key terms introduced in the problem (e.g. **leaf node**, **palindrome**)
- Format "Example N:" sections with a blank line before each
- Format "Input:" / "Output:" / "Explanation:" as their own lines
- Format "Constraints:" as a section header followed by a bullet list
- Convert mathematical exponents that lost their superscript formatting (e.g. n2 → n², n3 → n³, 10^4 → 10⁴, 2^31 → 2³¹) using Unicode superscript characters
- Do not add any explanation or preamble — output only the formatted description`

type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
}

func formatDescription(apiKey, description string) (string, error) {
	reqBody := anthropicRequest{
		Model:     model,
		MaxTokens: 2048,
		System:    systemPrompt,
		Messages: []anthropicMessage{
			{Role: "user", Content: description},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var parsed anthropicResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Content) == 0 {
		return "", fmt.Errorf("empty response from API")
	}

	return parsed.Content[0].Text, nil
}

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("STORAGE_DB_URL")
	apiKey := os.Getenv("LLM_API_KEY")

	if dbURL == "" || apiKey == "" {
		fmt.Fprintln(os.Stderr, "STORAGE_DB_URL and LLM_API_KEY must be set")
		os.Exit(1)
	}

	dryRun := flag.Bool("dry-run", false, "process one problem and print result without updating DB")
	offset := flag.Int("offset", 0, "which problem to use for dry run (0-indexed)")
	flag.Parse()

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db connect: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, "SELECT id, slug, description FROM problems ORDER BY created_at")
	if err != nil {
		fmt.Fprintf(os.Stderr, "query: %v\n", err)
		os.Exit(1)
	}

	type problem struct {
		id          string
		slug        string
		description string
	}

	var problems []problem
	for rows.Next() {
		var p problem
		if err := rows.Scan(&p.id, &p.slug, &p.description); err != nil {
			fmt.Fprintf(os.Stderr, "scan: %v\n", err)
			os.Exit(1)
		}
		problems = append(problems, p)
	}
	rows.Close()

	fmt.Printf("Found %d problems\n", len(problems))

	if *dryRun {
		idx := *offset
		if idx >= len(problems) {
			fmt.Fprintf(os.Stderr, "offset %d out of range (have %d problems)\n", idx, len(problems))
			os.Exit(1)
		}
		p := problems[idx]
		fmt.Printf("--- DRY RUN: %s ---\n\nORIGINAL:\n%s\n\n", p.slug, p.description)
		formatted, err := formatDescription(apiKey, p.description)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("FORMATTED:\n%s\n", formatted)
		return
	}

	for i, p := range problems {
		if strings.Contains(p.description, "`") || strings.Contains(p.description, "**") {
			fmt.Printf("[%d/%d] %s ... skipped (already formatted)\n", i+1, len(problems), p.slug)
			continue
		}

		fmt.Printf("[%d/%d] %s ... ", i+1, len(problems), p.slug)

		formatted, err := formatDescription(apiKey, p.description)
		if err != nil {
			fmt.Printf("ERROR: %v\n", err)
			continue
		}

		_, err = pool.Exec(ctx, "UPDATE problems SET description = $1 WHERE id = $2", formatted, p.id)
		if err != nil {
			fmt.Printf("UPDATE ERROR: %v\n", err)
			continue
		}

		fmt.Println("done")

		// stay well within API rate limits
		time.Sleep(500 * time.Millisecond)
	}

	fmt.Println("All done.")
}
