package handlers

import (
	"errors"
	"math/rand"
	"net/http"
	"strings"

	"leetgame/internal/models"
	"leetgame/internal/types"
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
)

type topicWeight struct {
	Topic  string
	Weight float64
}

// computeTopicWeights returns an inverse-proficiency weight for each available topic.
// Topics with no proficiency data default to score 0.0 (cold start → maximum weight).
// If all weights are zero (perfect scores everywhere), returns uniform weights.
func computeTopicWeights(proficiencies []models.TopicProficiency, tags []types.ProblemTag, activeStages []string) []topicWeight {
	scoreMap := make(map[string]float64)
	for _, p := range proficiencies {
		scoreMap[p.Topic+"|"+p.Stage] = p.Score
	}

	weights := make([]topicWeight, 0, len(tags))
	for _, tag := range tags {
		var total float64
		for _, stage := range activeStages {
			total += scoreMap[tag.Name+"|"+stage] // missing = 0.0
		}
		avg := total / float64(len(activeStages))
		weights = append(weights, topicWeight{Topic: tag.Name, Weight: 1.0 - avg})
	}

	// If all weights are zero, use uniform
	var sum float64
	for _, w := range weights {
		sum += w.Weight
	}
	if sum == 0 {
		for i := range weights {
			weights[i].Weight = 1.0
		}
	}

	return weights
}

// filterTagsByActiveTopics returns only the tags whose names are in activeTopics.
// If activeTopics is empty, all tags are returned unchanged.
func filterTagsByActiveTopics(tags []types.ProblemTag, activeTopics []string) []types.ProblemTag {
	if len(activeTopics) == 0 {
		return tags
	}
	topicSet := make(map[string]bool, len(activeTopics))
	for _, t := range activeTopics {
		topicSet[t] = true
	}
	filtered := make([]types.ProblemTag, 0, len(activeTopics))
	for _, tag := range tags {
		if topicSet[tag.Name] {
			filtered = append(filtered, tag)
		}
	}
	return filtered
}

// sampleTopic picks one topic from weights using weighted random sampling.
func sampleTopic(weights []topicWeight) string {
	if len(weights) == 0 {
		return ""
	}
	var sum float64
	for _, w := range weights {
		sum += w.Weight
	}
	r := rand.Float64() * sum
	for _, w := range weights {
		r -= w.Weight
		if r <= 0 {
			return w.Topic
		}
	}
	return weights[len(weights)-1].Topic
}

func (hs *HandlerService) GetSmartPracticeProblem(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}

	stagesParam := strings.TrimSpace(c.Query("active_stages"))
	if stagesParam == "" {
		return xerrors.BadRequestError("active_stages is required")
	}
	var activeStages []string
	for s := range strings.SplitSeq(stagesParam, ",") {
		if t := strings.TrimSpace(s); t != "" {
			activeStages = append(activeStages, t)
		}
	}
	if len(activeStages) == 0 {
		return xerrors.BadRequestError("active_stages must contain at least one non-empty value")
	}

	var activeTopics []string
	if topicsParam := strings.TrimSpace(c.Query("active_topics")); topicsParam != "" {
		for t := range strings.SplitSeq(topicsParam, ",") {
			if t := strings.TrimSpace(t); t != "" {
				activeTopics = append(activeTopics, t)
			}
		}
	}

	allTags, err := hs.storage.GetProblemTags(c.RequestCtx())
	if err != nil {
		return err
	}
	allTags = filterTagsByActiveTopics(allTags, activeTopics)

	proficiencies, err := hs.storage.GetTopicProficiencies(c.RequestCtx(), uid)
	if err != nil {
		return err
	}

	weights := computeTopicWeights(proficiencies, allTags, activeStages)
	if len(weights) == 0 {
		problem, err := hs.storage.GetRandomProblem(c.RequestCtx())
		if err != nil {
			return err
		}
		return c.Status(http.StatusOK).JSON(problem)
	}
	sampledTopic := sampleTopic(weights)

	problem, err := hs.storage.GetRandomProblemFiltered(c.RequestCtx(), "", nil, []string{sampledTopic}, "or", "")
	if err != nil {
		var httpErr xerrors.HTTPError
		if errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusNotFound {
			problem, err = hs.storage.GetRandomProblem(c.RequestCtx())
			if err != nil {
				return err
			}
		} else {
			return err
		}
	}

	return c.Status(http.StatusOK).JSON(problem)
}

func (hs *HandlerService) GetProficiency(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}
	proficiencies, err := hs.storage.GetTopicProficiencies(c.RequestCtx(), uid)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(proficiencies)
}

// fiber:context-methods migrated
