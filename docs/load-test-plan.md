# Load test plan: 100 users online sending messages

Step 15 of `docs/backend-build-plan.md`. The goal: show that the chat stays fast with 100 people online at once, sending messages, before real users arrive. This is the plan; the script is written and run only after the decisions in section 6.

## 1. What we measure

| Measure | How | Pass |
|---|---|---|
| Send time | Round trip of `send_message` from each client (the browser → database write the app does) | p95 under 100 ms (hot query target, `backend-design.md` §11) |
| Delivery time | From a client calling `send_message` until every other client with the chat open gets the `message` broadcast on `chat:{id}` | p95 under 300 ms |
| Lost messages | Every client compares the seqs it received with `list_messages` at the end (the app's own catch-up) | 0 missing |
| Errors | Failed RPCs, refused or dropped Realtime joins | 0 |
| Database | CPU, connections and slow queries in the Supabase dashboard (Reports → Database) while the test runs | CPU under 70 %, no query over 100 ms |
| Realtime | Concurrent connections and messages per second (Reports → Realtime) | Under the plan's quota, no throttling |

## 2. How the app sends live messages (what the test must copy)

- A phone with a chat open joins one private Realtime channel, `chat:{id}`; permission is checked once at join.
- `send_message` writes the post and calls `realtime.send()` in the same transaction; every phone in the channel gets it.
- Realtime counts each delivery: one post in a group where 100 people have it open is 100 Realtime messages.
- No per-user channel: the chat list refreshes when the app is opened or returned to.

## 3. Test accounts and data

- 100 test accounts named `Test load 1` … `Test load 100`, emails `load-N@test.invalid` (never real addresses), made with the admin API (email confirmed), consents given, approved in a non-adult demo community.
- One group with all 100 as members (history on, posting allowed), and 50 DMs (pairs 1–2, 3–4, …).
- Afterwards the accounts are removed with `delete_my_account`, which also removes their messages, DMs and files; then a check that no `Test load` member or `load-%@test.invalid` login is left.

## 4. Scenario (one Node script, 100 Supabase clients)

1. **Connect:** each client logs in with its password straight to Supabase Auth, in small batches (see the login limits in section 5), then joins `chat:{group}` and its DM channel.
2. **Normal (10 min):** each client posts once every 30–90 seconds, at random, alternating group and DM: about 2 posts a second in all, about 100–150 deliveries a second.
3. **Busy (2 min):** each client posts every 5–10 seconds: about 13 posts a second, about 1,300 deliveries a second in the group.
4. **Reconnect (1 min):** 20 clients drop their connection for 15 seconds and rejoin; each must catch up with `list_messages` (after its last seq) with nothing missing.
5. **Report:** p50/p95/p99 of send and delivery time, missing messages, errors, per phase.

The script runs from one machine. It measures the database and Realtime, not phones: the app's own speed on a phone was checked separately (LCP, INP targets).

## 5. Risks

- **The live site shares this database.** The busy phase adds real load while real people use the app, and the 100 accounts and their messages are in the live tables until cleanup. A separate Supabase project for the test removes both risks, but creating it is an account step (yours).
- **Realtime quotas depend on the plan.** The busy phase deliberately goes past what a free project allows per second; on Free we would measure the throttling, not the app. Check the current quotas on the Supabase pricing page before choosing the plan and the busy rate.
- **Login limits:** our own (30 password tries per IP per 15 minutes) would block 100 logins from one machine through the app's login form, so the script logs in straight to Supabase Auth; Supabase's own sign-in limit per IP (Auth → Rate Limits in the dashboard) still applies there, so the script logs in in small batches during the connect phase, or the limit is raised for the test and set back after.

## 6. Decisions needed before it runs

1. Where: the live project (with cleanup straight after, at a quiet hour), or a separate test project (an account step for you).
2. Which plan it runs on (Free or Pro): that decides the busy-phase rate.
3. Your go-ahead to create the 100 test accounts.
