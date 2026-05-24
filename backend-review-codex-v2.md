## Re-review: Requested Fix Checks

1. `FIXED` — `gobuster.py` `run()` now uses `args["url"]`, not `args["target"]`.
Relevant lines:
- `E:\projects\PentAGI\src\pentagi\tools\gobuster.py:59-68` defines `run()`.
- `E:\projects\PentAGI\src\pentagi\tools\gobuster.py:67` reads `target = args["url"]`.

2. `FIXED` — `ooda.py` `act()` now returns `(None, 0)` when there is no open intent, and `runner.py` breaks on `None`.
Relevant lines:
- `E:\projects\PentAGI\src\pentagi\agent\ooda.py:148-153` checks `repo.pick_open_intent(...)`, logs the stop condition, and returns `None, 0`.
- `E:\projects\PentAGI\src\pentagi\agent\runner.py:91-99` checks `if _new_facts is None:` and breaks after setting task status to `stopped` with `stop_reason="no_intent"`.

3. `FIXED` — the requested `parse_to_facts()` functions now fail closed on non-zero tool exit and raise `RuntimeError`.
Relevant lines:
- `E:\projects\PentAGI\src\pentagi\tools\nmap.py:75-81`
- `E:\projects\PentAGI\src\pentagi\tools\gobuster.py:104-109`
- `E:\projects\PentAGI\src\pentagi\tools\httpx_tool.py:79-84`

4. `FIXED` — `ooda.py` `orient()` now emits exactly one `[Orient]` log line per call.
Relevant lines:
- `E:\projects\PentAGI\src\pentagi\agent\ooda.py:74-84` builds exactly one message and emits a single `_console_log("Orient", msg)` at line 83.
- `E:\projects\PentAGI\src\pentagi\agent\hint_watcher.py:24-58` performs the flush logic without additional console logging, so `orient()` is not indirectly producing extra `[Orient]` lines through that callee.

5. `FIXED` — `repo.py` `add_intent()` now accepts `from_fact_ids` and inserts rows into `intent_sources`.
Relevant lines:
- `E:\projects\PentAGI\src\pentagi\blackboard\repo.py:414-437` adds the `from_fact_ids` parameter and inserts `intent_sources` rows via `INSERT OR IGNORE`.
- `E:\projects\PentAGI\src\pentagi\agent\ooda.py:124-131` passes the LLM-provided `from_fact_ids` into `repo.add_intent(...)`.
- `E:\projects\PentAGI\src\pentagi\blackboard\db.py:66-73` defines the `intent_sources` table used by this linkage.

## VERDICT: APPROVE_WITH_NOTES

All five requested re-review items are fixed in the current `E:\projects\PentAGI` checkout.

Note:
- A related residue from the earlier silent-failure class still appears in `E:\projects\PentAGI\src\pentagi\tools\sqlmap.py:116-146`: `parse_to_facts()` does not currently check `result.return_code != 0` before interpreting output. That is outside the five checks you asked for, so it does not change the per-item statuses above, but it is worth aligning with the other tool parsers.
