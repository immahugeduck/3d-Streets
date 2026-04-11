# Day 2 AI Hardening Changelog

## Summary
Implemented API and client hardening for AI request reliability, observability, and supportability.

## Backend Changes
File: api/ai.js

- Added request correlation support:
  - Accepts optional x-client-request-id from client.
  - Returns X-Request-Id response header.
  - Includes requestId in structured error responses.
- Added structured error code taxonomy:
  - BAD_METHOD, RATE_LIMITED, BAD_JSON, BAD_BODY, BAD_PAYLOAD
  - AI_MISSING_KEY, AI_API_KEY_INVALID, AI_MODEL_NOT_FOUND
  - AI_PROVIDER_RATE_LIMIT, AI_TIMEOUT, AI_PROVIDER_ERROR
- Added structured JSON logs for:
  - ai_request_success
  - ai_request_failed
  - ai_request_rejected
  Logs include action, requestId, status, durationMs, and code.
- Standardized API error response shape:
  - { error, code, requestId }

## Client Changes
File: src/services/anthropicService.js

- Added client request ID generation and sends x-client-request-id on every AI call.
- Captures and exposes last AI request metadata:
  - action, status, code, requestId
- Added error message mapping for common failure codes.
- Improved console diagnostics to include action/status/code/requestId.

## UI Changes
File: src/components/AI/AICopilot.jsx

- AI fallback error now appends a reference ID when available:
  - "Ref: <requestId>"
  This allows quick correlation with backend logs.

## Validation
- File diagnostics checked for all touched files with no reported errors.

## Follow-Up
- Optional: add server metric counters by error code for dashboards.
- Optional: add retry/backoff behavior for transient AI_PROVIDER_RATE_LIMIT responses.
