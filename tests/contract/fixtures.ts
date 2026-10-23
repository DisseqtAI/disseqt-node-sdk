// Fixtures mirror the Go json tags in disseqt-dataset-backend (deepteam-parity branch).

/** api/testing_validate_handler.go TestingValidateResponse. */
export const testingValidateResponse = {
  results: [
    {
      validator_name: 'toxicity',
      score: 0.91,
      failed: true,
      explanation: 'abusive language',
      rule_status: 'fail',
    },
    { validator_name: 'pii', score: 0, failed: false, rule_status: 'error', error: 'timeout' },
  ],
  aggregate_decision: 'BLOCK',
  processed_at: '2026-10-23T10:00:00Z',
};

/** api/testing_types.go TestingRunResponse (stop_reason per the shared contract). */
export const testingRunStopped = {
  id: '33333333-3333-4333-8333-333333333333',
  session_id: '44444444-4444-4444-8444-444444444444',
  status: 'stopped',
  stop_reason: 'user_cancelled',
  progress: {},
  summary: {},
  trigger_metadata: { source: 'disseqt-cli' },
  created_at: '2026-10-23T10:00:00Z',
  updated_at: '2026-10-23T10:01:00Z',
};

/** api/prompt_packs_types.go PaginationResponse. */
export const pagination = (page: number, totalPages: number, pageSize = 2) => ({
  page,
  page_size: pageSize,
  total: totalPages * pageSize,
  total_pages: totalPages,
  has_next: page < totalPages,
});

/** api/testing_types.go TestingResultsListResponse ({items, pagination}). */
export const testingResultsPage = {
  items: [
    { id: 'r1', run_id: 'run', prompt_text: 'hi', breach_detected: true, validations: {} },
    { id: 'r2', run_id: 'run', prompt_text: 'yo', breach_detected: false, validations: {} },
  ],
  pagination: pagination(1, 1),
};
