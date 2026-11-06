# Ambientic synthetic orchestration pilot

- Request ID: ambientic-pilot-fixture-1
- Purpose: verify the request/result transport only.
- Sources: this file only. Do not call production, analytics, Slack, GitHub, or other external services.
- Task: compute 2 + 2 and report 4 as a synthetic fixture value. Explicitly state that no experiment was analyzed and no product decision follows.
- Output: use the exact result path and readout fields supplied by the Ambientic job prompt. Use a unique Readout ID, `Status: complete`, and the actual current ISO timestamp. Mark measurement window as synthetic and limitations as no production data accessed.
- Boundaries: do not edit code, canonical records, memory, requests, or schedules. Do not publish or send anything.
