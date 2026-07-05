package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"

	"leetgame/internal/llm"
	"leetgame/internal/types"
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

func (hs *HandlerService) Chat(c fiber.Ctx) error {
	var req types.ChatRequest
	if err := c.Bind().Body(&req); err != nil {
		return xerrors.InvalidJSON()
	}
	if errs := req.Validate(); len(errs) > 0 {
		return xerrors.UnprocessableEntityError(errs)
	}

	problem, err := hs.storage.GetProblemByID(c.RequestCtx(), req.ProblemID)
	if err != nil {
		return err
	}

	history := make([]llm.ChatMessage, len(req.History))
	for i, h := range req.History {
		history[i] = llm.ChatMessage{Role: h.Role, Content: h.Content}
	}

	// fasthttp forbids accessing RequestCtx from inside SetBodyStreamWriter.
	// Extract everything from c before registering the callback.
	streamCtx, cancelStream := context.WithCancel(context.Background())

	// Extract evaluation inputs before the stream writer — fasthttp recycles c after handler returns
	evalUID, _ := xcontext.GetUserID(c)
	evalEnabled := evalUID != uuid.Nil
	evalProblem := problem
	evalProblem.TopicTags = append([]string(nil), problem.TopicTags...)
	evalActiveStages := append([]string(nil), req.ActiveStages...)
	// baseHistory for the evaluator — preserves Marker fields from prior turns
	var currentMarker string
	if req.HintRequested {
		currentMarker = "hint"
	} else if req.AnswerRequested {
		currentMarker = "answer"
	}
	baseHistory := make([]llm.ChatMessage, 0, len(req.History)+1)
	for _, h := range req.History {
		baseHistory = append(baseHistory, llm.ChatMessage{Role: h.Role, Content: h.Content, Marker: h.Marker})
	}
	baseHistory = append(baseHistory, llm.ChatMessage{Role: "user", Content: req.Message, Marker: currentMarker})

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.RequestCtx().SetBodyStreamWriter(func(w *bufio.Writer) {
		defer cancelStream()

		onToken := func(token string) {
			data, _ := json.Marshal(map[string]string{"content": token})
			if _, err := fmt.Fprintf(w, "event: token\ndata: %s\n\n", data); err != nil {
				cancelStream()
				return
			}
			if err := w.Flush(); err != nil {
				cancelStream()
				return
			}
		}

		result, err := hs.llmClient.Evaluate(streamCtx, problem, req.Stage, req.ActiveStages, history, req.Message, req.HintRequested, req.AnswerRequested, req.Concise, onToken)
		if err != nil {
			hs.logger.Error("llm evaluate failed", "error", err)
			fmt.Fprintf(w, "event: error\ndata: {}\n\n") //nolint:errcheck
			w.Flush()                                    //nolint:errcheck
			return
		}

		if req.AnswerRequested {
			result.Stage = nextStage(req.Stage, req.ActiveStages)
		}

		done, _ := json.Marshal(map[string]string{"stage": result.Stage, "message": result.Message})
		fmt.Fprintf(w, "event: done\ndata: %s\n\n", done) //nolint:errcheck
		w.Flush()                                         //nolint:errcheck

		if evalEnabled && result.Stage == "complete" {
			fullHistory := append(baseHistory[:len(baseHistory):len(baseHistory)], llm.ChatMessage{Role: "assistant", Content: result.Message})
			go hs.dispatcher.Dispatch(context.Background(), evalUID, evalProblem, evalActiveStages, fullHistory)
		}
	})

	return nil
}

func nextStage(current string, activeStages []string) string {
	for i, s := range activeStages {
		if s == current && i+1 < len(activeStages) {
			return activeStages[i+1]
		}
	}
	return "complete"
}

// fiber:context-methods migrated
