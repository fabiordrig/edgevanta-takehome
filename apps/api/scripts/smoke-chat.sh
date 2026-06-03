#!/usr/bin/env bash
# smoke-chat.sh — E2E smoke test for the AgentController SSE chat endpoint.
#
# PURPOSE: Operator-run smoke test verifying progressive streaming, grounded
# refusal, and multi-turn history. Requires a running API server with:
#   - ANTHROPIC_API_KEY and OPENAI_API_KEY set in .env
#   - At least one CSV ingested via POST /ingest
#
# USAGE:
#   1. Start the server:  pnpm dev  (from repo root)
#   2. Ingest a file:     curl -s -X POST http://localhost:3001/ingest -F file=@your.csv
#   3. Run this script:   bash apps/api/scripts/smoke-chat.sh
#
# ENDPOINT: POST /agent/chat  (Content-Type: application/json)
# BODY:     { "messages": [{ "role": "user", "content": "..." }] }
# RESPONSE: SSE stream — data: {"token":"..."} frames + data: {"done":true}
#
# EXIT: 0 if all curl connections succeeded; non-zero if any curl call fails to
#       connect to the server (curl exit code 7 = connection refused).

set -euo pipefail

API_URL="${API_URL:-http://localhost:3001}"
ENDPOINT="${API_URL}/agent/chat"

# ─── Helpers ─────────────────────────────────────────────────────────────────

print_header() {
  echo ""
  echo "════════════════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "════════════════════════════════════════════════════════════════════════"
}

print_subheader() {
  echo ""
  echo "  ── $1"
  echo ""
}

# Run a streaming curl POST and print the raw SSE frames.
# Args: $1 = scenario label, $2 = JSON body string
run_sse_chat() {
  local label="$1"
  local body="$2"

  print_subheader "REQUEST: $label"
  echo "  Endpoint: POST $ENDPOINT"
  echo "  Body: $body"
  echo ""
  echo "  SSE stream output:"
  echo "  ─────────────────────────────────────────"

  # curl flags:
  #   -N  — disable output buffering (required for SSE progressive display)
  #   -s  — silent (no progress meter)
  #   -f  — fail on HTTP error status (4xx/5xx exits non-zero)
  #   --connect-timeout 5 — abort if server is unreachable within 5s
  # The --connect-timeout exit code 7 means "connection refused" which
  # set -e will surface as a script failure (server not running).
  curl -N -s -f \
    --connect-timeout 5 \
    --max-time 120 \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$ENDPOINT" \
    | while IFS= read -r line; do
        echo "  $line"
      done

  echo ""
  echo "  ─────────────────────────────────────────"
  echo "  [curl completed for: $label]"
}

# ─── Scenario (a): GROUNDED ───────────────────────────────────────────────────
# Ask about a real construction bid item to confirm the agent grounds its answer
# in the ingested corpus and streams tokens progressively.
#
# SUCCESS CRITERIA (UI-01 + AGT-01):
#   - Multiple data: lines arrive over time (progressive streaming, not one blob)
#   - The assembled answer includes a source filename citation
#   - Response is grounded in the ingested CSV data (no fabricated values)

print_header "SCENARIO (a): GROUNDED — Ask about ingested bid data"

echo "  This scenario sends a question about construction bid unit prices."
echo "  VERIFY: tokens arrive progressively (multiple data: lines before done),"
echo "  the answer cites a source filename, and prices come from the ingested CSV."

run_sse_chat \
  "GROUNDED — bid item unit price" \
  '{"messages":[{"role":"user","content":"What are the unit prices for excavation or earthwork items in the ingested documents? Please cite the source file."}]}'

# ─── Scenario (b): REFUSAL ───────────────────────────────────────────────────
# Ask about something certainly not in a DOT construction corpus to confirm the
# agent refuses rather than hallucinating.
#
# SUCCESS CRITERIA (AGT-05):
#   - Response contains "I don't have enough information in the ingested documents
#     to answer this question accurately." (exact refusal string from system prompt)
#   - NO fabricated numbers or prices

print_header "SCENARIO (b): REFUSAL — Ask about something NOT in corpus"

echo "  This scenario sends a question about a Mars rover landing pad."
echo "  VERIFY: the response contains the exact refusal phrase:"
echo "    \"I don't have enough information in the ingested documents to answer"
echo "     this question accurately.\""
echo "  CONFIRM: no fabricated bid price appears in the response."

run_sse_chat \
  "REFUSAL — Mars rover (not in corpus)" \
  '{"messages":[{"role":"user","content":"What is the bid price for a Mars rover landing pad construction project? Please give me the exact unit price per square foot."}]}'

# ─── Scenario (c): MULTI-TURN ────────────────────────────────────────────────
# Send a two-turn history to confirm the controller accepts full ChatMessage[]
# history and the agent uses context from the prior turn.
#
# SUCCESS CRITERIA (AGT-07):
#   - Server accepts a messages array with user + assistant + user turns
#   - The second answer references context from the first user question or
#     clarifies based on the assistant's prior response

print_header "SCENARIO (c): MULTI-TURN — Send conversation history"

echo "  This scenario sends a 3-turn history (user → assistant → user)."
echo "  VERIFY: the server processes all three turns without error,"
echo "  and the second answer demonstrates awareness of the prior context."

run_sse_chat \
  "MULTI-TURN — two user turns with prior context" \
  '{"messages":[{"role":"user","content":"What documents have been ingested?"},{"role":"assistant","content":"I will check the available documents for you using the list_documents tool."},{"role":"user","content":"Based on those documents, what construction bid items are mentioned most frequently?"}]}'

# ─── End ─────────────────────────────────────────────────────────────────────

print_header "SMOKE TEST COMPLETE"

echo "  Manual verification checklist:"
echo ""
echo "  [ ] STREAMING  (UI-01): In scenario (a), SSE data: frames arrived"
echo "                          progressively, NOT as a single blob."
echo "                          Assembled answer cites a source filename."
echo ""
echo "  [ ] REFUSAL    (AGT-05): In scenario (b), response contains:"
echo "                           \"I don't have enough information in the"
echo "                           ingested documents to answer this question"
echo "                           accurately.\" No fabricated price present."
echo ""
echo "  [ ] MULTI-TURN (AGT-07): In scenario (c), server accepted 3-turn"
echo "                           history; second answer references prior context."
echo ""
echo "  [ ] TOOL USE   (AGT-06): Check server logs for at least one log line"
echo "                           showing search_documents / detect_outliers /"
echo "                           list_documents tool invocation."
echo ""
echo "  If any criterion fails, capture the output above for gap closure."
echo ""
