# Argus.AI: Engineering Changes and Interview Notes

> Language: ASD-STE100 (Simplified Technical English) style. Sentences are short. Each sentence has one idea. The text uses the active voice.

## 1. Purpose

This document records the engineering changes to the Argus.AI server and client.
For each change, it gives:

- The problem in the old version.
- The risk of that problem.
- The change that we made.
- The impact of the change.
- Points to say in an interview.

Section 10 gives short answers to frequent interview questions.

---

## 2. Summary

| # | Area | Problem in the old version | Change | Impact |
|---|---|---|---|---|
| 1 | Dispatch | Two operators could send one unit to two incidents. | Transactions and compare-and-set updates. Audit log in the same transaction. | One unit, one incident. Tested with 10 parallel requests: 1 success, 9 conflicts. |
| 2 | Access | No login. Any person could dispatch, delete or post advisories. | JWT authentication. Two roles: citizen and admin. | Each role can only do its own tasks. The server checks every route and socket. |
| 3 | Trust boundary | The client sent "AI results" directly into the database. | The server does the analysis and creates the incident. zod validates all input. | A user cannot write a false incident. Unknown fields are removed. |
| 4 | AI calls | One call, no timeout, no retry, regex parse. Unknown location became Delhi with no warning. | AI harness: timeout, retry, schema check, repair, rule-based fallback. | A report always gets a triage. The dashboard shows when the AI did not answer. |
| 5 | Duplicates | A retry or a double click made two incidents. | Idempotency key with a unique index. | One submission makes one incident. Tested with 4 parallel duplicates. |
| 6 | WebSockets | Each write read all incidents and units and sent them to all clients. No socket auth. CORS `*`. | JWT socket handshake, role rooms, one-document deltas, resync on reconnect. | Event size does not grow with data size. Citizens do not receive admin data. |
| 7 | Reads | `/api/data` loaded all collections. The client calculated distance to all units. | Keyset pagination. Compound indexes. `$geoNear` on a 2dsphere index. | Query cost depends on page size, not table size. Verified with `explain()`. |
| 8 | Operations | Server started with no database. 18 known vulnerabilities. No tests. No CI. | Fail-fast start, graceful stop, Express 5, 0 production vulnerabilities, 11 tests, CI. | Problems show at start or in CI, not in production. |

---

## 3. Dispatch: Transactions and Concurrency

### 3.1 Problem in the old version

The old `deployUnit` did two separate writes:

1. It set the unit to `BUSY`.
2. It set the incident to `DISPATCHED`.

It did not examine the unit status before the write.
There was no transaction.

### 3.2 Risk

- Two operators click DEPLOY on the same unit at the same time. Both requests succeed. One ambulance goes to two incidents.
- Step 1 succeeds and step 2 fails. The unit stays `BUSY` with no incident. Nobody can use that unit.

In a payment system, this is the same bug as "double spend".

### 3.3 Change

File: `server/src/services/incidentService.js`

1. Each operation runs in one MongoDB transaction (`server/src/utils/transaction.js`).
2. Each update includes the expected state in the filter. This is "compare-and-set".
   - The unit update matches only `status: IDLE`.
   - The incident update matches only `status: PENDING`.
3. If a filter matches nothing, the code throws HTTP 409 (Conflict).
4. The 409 aborts the transaction. MongoDB rolls back all writes in it.
5. The audit log entry is written in the same transaction.
6. Socket events are sent only after the commit.

### 3.4 Why the events go after the commit

`withTransaction` can run the callback again after a transient error.
If the callback sends an event, a client can see a change that MongoDB later rolls back.
Thus, the callback only writes to the database.

### 3.5 Impact

- One unit can have only one active incident.
- A failed step leaves no partial data.
- The audit log always agrees with the data.

Test results (`server/test/dispatch.test.js`, real replica set):

| Test | Result |
|---|---|
| 10 parallel dispatches of one unit | 1 success, 9 × HTTP 409 |
| Incidents after the race | 1 `DISPATCHED`, 9 `PENDING` with no unit |
| Audit entries after the race | 1 |
| Step 2 fails after step 1 succeeds | Unit is `IDLE` again. 0 audit entries. |
| Race duration, 10 requests, local | About 65 ms |

### 3.6 Interview points

- "I use optimistic concurrency. I do not lock the document. The filter is the check."
- "The transaction gives atomicity. The compare-and-set gives isolation against the race."
- "MongoDB transactions need a replica set. Atlas is a replica set. For local work I start `mongod --replSet`."
- "A write conflict between two transactions is a transient error. The driver runs the callback again. On the second run the filter fails, so the request gets 409."

---

## 4. Authentication and RBAC

### 4.1 Problem in the old version

- There was no user account and no login.
- Any person could create units, dispatch units, delete incidents and publish advisories.
- Only `/clear` had a check: a shared admin key in a header.
- `createUnit` saved `req.body` directly. A client could set any field ("mass assignment").

### 4.2 Change

1. A `User` model with a `role` field: `citizen` or `admin`.
2. Passwords use `scrypt` with a random salt. The compare is constant-time.
3. Login returns a JWT. The JWT contains the user id and the role.
4. `requireAuth` checks the token. `requireRole` checks the role.
5. All routes are in one table, grouped by role (`server/src/routes/apiRoutes.js`).
6. Public sign-up always makes a citizen. The seed script makes the admin.
7. Login and sign-up have a strict rate limit against brute force.
8. Login gives the same error for a wrong email and a wrong password.

On the client:

- Citizens see only the social feed and the helpline.
- Admins see only the dashboard and the unit manager.
- A wrong-role URL sends the user to their home page.

### 4.3 Impact

- A citizen cannot dispatch, delete or reset. The server returns 403.
- A request with no token or a changed token gets 401.
- A citizen cannot become an admin by adding `role: admin` to the sign-up body.

### 4.4 Interview points

- "The client hides screens, but the server is the real control. I tested each route with a citizen token."
- "JWT is stateless. Any server instance can verify a request. I do not need a shared session store."
- "Trade-off: I cannot revoke one JWT before it expires. A short expiry or a deny list fixes this."
- "I used Node `crypto.scrypt`. It is memory-hard and needs no native package."

---

## 5. Trust Boundary and Input Validation

### 5.1 Problem in the old version

The client did the report flow in two calls:

1. `POST /api/analyze` returned the AI result to the browser.
2. `POST /api/incident` sent that result back to the server.

The server saved the second body with no check.

### 5.2 Risk

- Any user could post a false incident with any severity and any location.
- The AI step was optional. A user could skip it.
- The JSON body limit was 50 MB. There was no media type check.

### 5.3 Change

1. One call: `POST /api/reports`. The server runs the AI and creates the incident.
2. A zod schema validates every request body (`validateBody`).
3. zod removes unknown keys. A client cannot set `status` or `severity`.
4. Media must be `image/*`, `audio/*` or `video/*`, with a size limit.
5. The body limit is now 10 MB.
6. Citizens receive a limited view of their reports (`toCitizenView`). This view has no operator notes and no unit data.

### 5.4 Interview points

- "Never trust the client. The browser is in the user's control."
- "I treat the LLM output the same way. It is untrusted input. zod validates it too."

---

## 6. AI Harness

### 6.1 Problem in the old version

- One call to Gemini with no timeout. A slow model held the request open.
- No retry for temporary errors, such as HTTP 429 or 503.
- The parser removed Markdown fences with regex, then called `JSON.parse`.
- If the AI gave no valid coordinates, the code used the Delhi city centre. The dashboard showed this as a real location.
- If the AI failed, the citizen received "SYSTEM ERROR". The report was lost.

### 6.2 Change

Files: `server/src/ai/`

The harness (`harness.js`) runs each AI task in five steps:

1. **Timeout.** It aborts the call after `AI_TIMEOUT_MS` (default 15 s).
2. **Retry.** It tries again on timeout, 429, 5xx and network errors. The wait doubles each time and has random jitter. Other 4xx errors do not retry.
3. **Validate.** A zod schema checks the output.
4. **Repair.** If the output is not valid, the next attempt tells the model the exact error.
5. **Fallback.** After the last attempt, keyword rules classify the report.

Other changes:

- Gemini JSON mode replaces the regex parser.
- The prompt tells the model to use `null` for an unknown location.
- An unknown location is stored with `approximate: true`. The dashboard shows "LOCATION UNVERIFIED".
- Each incident stores its provenance: `model` or `fallback`, attempts and latency. The dashboard shows "RULE-BASED TRIAGE" for a fallback.
- The prompt tells the model that the report is data, not instructions (prompt injection defence).
- A task is a plain object. A provider is a plain object. Gemini is one 30-line provider file.
- Advisories have two steps: the AI writes a draft, then an admin approves it.

### 6.3 Impact

- A report always becomes an incident, also when the AI is down.
- The operator can see which results came from the AI and which came from rules.
- The system never shows a guessed location as a fact.
- A change of AI provider needs one new provider file.

Tests (`server/test/harness.test.js`, fake provider, 8 tests):

- Valid output on the first attempt.
- Invalid JSON, then repair on attempt 2.
- 503 and 429, then success on attempt 3.
- 400: no retry, immediate fallback.
- No answer: timeout, then fallback.
- No API key: fallback with 0 attempts.
- Severity 42: rejected by the schema.
- Advisory longer than 280 characters: repaired.

### 6.4 Interview points

- "I treat the LLM as an unreliable network dependency, like a payment gateway."
- "The fallback is deterministic. It is less smart, but it is always available."
- "Trade-off: the keyword rules use substring match. 'screenshot' matches 'shot'. A small classifier can replace them."

---

## 7. Idempotency

### 7.1 Problem in the old version

A network retry or a double click created a second incident for the same report.

### 7.2 Change

1. The client creates a UUID (`clientRequestId`) for each post.
2. A retry of the same post sends the same UUID.
3. A unique index on `(reporter, clientRequestId)` allows only one incident.
4. The server first looks for the key. If it exists, it returns the first result.
5. Two parallel requests can both pass step 4. The unique index rejects the second insert (error E11000). The server then returns the first result.
6. The index is partial. Old incidents with no key do not collide.

### 7.3 Impact

Test: 4 parallel requests with one key gave `201, 200, 200, 200` and one incident.

### 7.4 Interview points

- "The application check is fast. The unique index is the real guarantee."
- "This is the same pattern as idempotency keys in payment APIs."

---

## 8. WebSockets

### 8.1 Problem in the old version

- After each write, the server read **all** incidents and **all** units.
- It sent the full lists to **all** connected clients.
- Socket.IO allowed any origin (`cors: *`). It had no authentication.
- A client that lost the connection did not receive the missed events.

### 8.2 Risk

- Each event cost O(n) database reads and O(n) bytes per client. The cost grows with the data.
- Any web page could connect and read all incident data.

### 8.3 Change

File: `server/src/realtime/socket.js`

1. The handshake must contain a valid JWT. Else the server rejects the socket.
2. Rooms:
   - `admins`: incident and unit events.
   - `user:<id>`: status events for that citizen's own reports.
3. Each event contains only the changed document (a "delta").
4. All event names are in one `publish` map.
5. On each connect and reconnect, the client loads a REST snapshot. Then it applies deltas.
6. CORS for REST and sockets uses the `CLIENT_ORIGIN` list.

### 8.4 Impact

- Event size is constant. It does not depend on the number of incidents.
- A citizen receives advisories and their own report status only. Test: the citizen socket received `advisory:published` only. The admin socket received `unit:updated` and `advisory:published`.
- An anonymous socket receives `unauthorized` and does not connect.
- Missed events are recovered on reconnect.

### 8.5 Interview points

- "Snapshot plus deltas is a standard sync pattern. The snapshot repairs any gap."
- "For more than one server, I add the Redis adapter. Then a room broadcast reaches sockets on other instances. The comment in `socket.js` shows the place."
- "Trade-off: the server checks the token once, at handshake. A long connection can live after the token expires."

---

## 9. Reads, Indexes and Scale

### 9.1 Problem in the old version

- `GET /api/data` returned all incidents, all units and 50 advisories. There was no limit on incidents.
- The client calculated the distance to every unit (haversine) to find the nearest.
- Incidents had only single-field indexes.

### 9.2 Change

1. `GET /api/incidents` uses keyset (cursor) pagination on `(createdAt, _id)`.
   - It does not use `skip`. `skip` reads and discards rows. Deep pages become slow.
   - The query reads `limit + 1` rows. The extra row shows if a next page exists. No `COUNT` query is necessary.
2. Compound indexes:
   - `{ status, createdAt, _id }` for the dashboard.
   - `{ reporter, createdAt }` for "my reports".
   - `{ reporter, clientRequestId }` unique and partial, for idempotency.
3. Units store GeoJSON with a `2dsphere` index.
4. `GET /incidents/:id/nearest-units` uses one `$geoNear` aggregation. It returns the nearest idle unit of each type.

### 9.3 Evidence (`explain()` output)

| Query | Plan |
|---|---|
| Dashboard list | `IXSCAN` on `status_1_createdAt_-1__id_-1` (two scans merged with `SORT_MERGE`). No in-memory sort. Documents examined = documents returned. |
| My reports | `IXSCAN` on `reporter_1_createdAt_-1` |
| Nearest units | `GEO_NEAR_2DSPHERE` on `location_2dsphere` |

### 9.4 How the system grows (for "how does this scale?")

| Load | Bottleneck | Next step |
|---|---|---|
| 1 server | None at demo scale | Current design |
| 2+ servers | Socket rooms and rate-limit counters are in memory | Socket.IO Redis adapter. `rate-limit-redis` store. JWT already works on any instance. |
| Many reports | AI calls hold HTTP requests open | Return `202 Accepted`. Put AI work in a queue (for example BullMQ). Send the result through the socket. |
| Large media | Base64 in JSON uses memory | Upload to object storage with a signed URL. Send only the URL. |
| Many reads | Primary database | Read replicas for dashboards. Writes stay on the primary. |
| Many cities | One database | Shard by region. Most queries contain the region. |

---

## 10. Operations and Code Quality

| Before | After |
|---|---|
| The server started when the database connection failed. All requests then failed. | The server stops at start with a clear error. |
| No shutdown handler. | On `SIGTERM`, the server closes sockets, HTTP and the database pool. |
| Express 4. Each controller had `try/catch`. | Express 5 sends async errors to one error handler. |
| Error responses could show internal model names. | `HttpError` gives clean messages. Cast errors show "Invalid id". |
| 18 known vulnerabilities in server packages (1 critical). | 0 in production packages (`npm audit --omit=dev`). |
| Two Gemini SDKs. One was not used. `nodemon` for reload. | One SDK. `node --watch` (built in). |
| Status strings typed by hand in many files. | One `enums.js`. Schema `enum` checks. |
| No tests. No CI. | 11 tests (`npm test`). GitHub Actions runs tests and the client build. |
| The helpline kept the microphone open after the call. | The helpline stops the microphone tracks. |

---

## 11. Known Limits (say these before the interviewer does)

- Rate-limit counters are per instance. Use a Redis store for more than one instance.
- The JWT is in `localStorage`. An XSS bug can read it. An `httpOnly` cookie is safer, but it needs CSRF protection.
- A socket checks the token only at connect.
- The reset operation uses one transaction over full collections. MongoDB limits a transaction to about 60 s and 16 MB of changes. A large system must archive in batches.
- The AI runs inside the HTTP request. A queue is the next step at high load.
- The fallback keyword rules are simple.

---

## 12. Frequent Interview Questions

**Q: What was the most serious bug?**
A: The dispatch race. Two operators could send one unit to two incidents. I fixed it with a transaction and compare-and-set updates. A test runs 10 parallel dispatches and expects exactly 1 success.

**Q: Why MongoDB transactions and not only `findOneAndUpdate`?**
A: One conditional update is atomic for one document. Dispatch changes two documents and writes an audit entry. All three must commit together.

**Q: Optimistic or pessimistic locking?**
A: Optimistic. The filter checks the expected state. Conflicts are rare, so I do not hold locks. The loser receives 409 and new options.

**Q: How do you stop duplicate reports?**
A: An idempotency key from the client and a unique index on the server. The index is the guarantee, not the application check.

**Q: What happens when Gemini is down?**
A: The harness tries 3 times with backoff. Then keyword rules classify the report. The incident shows "RULE-BASED TRIAGE". The citizen does not see an error.

**Q: How do you validate LLM output?**
A: JSON mode, then a zod schema. If the check fails, the next attempt sends the error to the model. The model then corrects its output.

**Q: Why keyset pagination?**
A: `skip(n)` reads n rows and discards them. A cursor starts at a known row through the index. New rows at the top do not move the pages.

**Q: How does a citizen see only their data?**
A: Three layers. The route needs the citizen role. The query filters on `reporter: req.user.id`. The response uses a limited view. Socket events go only to the `user:<id>` room.

**Q: How do you scale WebSockets?**
A: Clients receive deltas, not full lists. For many instances, I add the Redis adapter. Clients reload a snapshot on reconnect, so a lost event does no damage.

**Q: What would you do next?**
A: A queue for AI work, object storage for media, Redis for rate limits and sockets, and `httpOnly` cookie sessions.
