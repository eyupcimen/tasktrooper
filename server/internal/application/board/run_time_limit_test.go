package board

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/makifbaysal/tasktrooper/server/internal/domain"
)

type hangingExecutor struct{ fakeExecutor }

func (h *hangingExecutor) Execute(ctx context.Context, req domain.TaskExecution) (domain.AgentResponse, error) {
	h.mu.Lock()
	h.lastReq = req
	h.mu.Unlock()
	<-ctx.Done()
	return domain.AgentResponse{}, ctx.Err()
}

func TestRunPastItsTimeLimitIsStoppedAndParkedForAHuman(t *testing.T) {
	runs := &recordingRunStore{}
	ex := &hangingExecutor{fakeExecutor{supports: domain.LLMProviderClaudeCode}}
	r, job := executorRunner(t, claudeCodeAgent(), runs, ex)
	blocker := &blockRecorder{}
	r.SetTaskBlocker(blocker)
	r.SetRunTimeLimit(50 * time.Millisecond)

	done := make(chan error, 1)
	go func() { done <- r.execute(context.Background(), context.Background(), func() {}, job) }()
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("the run was not stopped at its time limit")
	}

	resource, detail := blocker.parked()
	assert.Equal(t, domain.ResourceHumanDecision, resource)
	assert.Contains(t, detail, "run limit")
	assert.Equal(t, domain.TaskAgentRunStatusFailed, runs.row().Status)

	last := ex.request().History[len(ex.request().History)-1].Content
	assert.True(t, strings.Contains(last, "minutes of wall-clock time"), "the agent must be told its budget up front")
}

func TestRunWithoutATimeLimitIsNotBounded(t *testing.T) {
	r := NewRunner(RunnerDeps{})
	ctx, cancel := r.withRunTimeLimit(context.Background())
	defer cancel()
	_, hasDeadline := ctx.Deadline()
	assert.False(t, hasDeadline)
}
