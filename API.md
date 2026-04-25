# API Reference

**Public base URL:** `http://ec2-13-206-110-74.ap-south-1.compute.amazonaws.com` (subject to change on instance restart — see DEPLOYMENT.md)

All endpoints accept JSON unless noted otherwise.

---

## `GET /health`

Liveness probe.

**Response** `200 OK`

```json
{ "status": "ok", "timestamp": "2026-04-26T10:30:00.000Z" }
```

---

## `POST /rfq`

Parses a natural-language RFQ message into a structured opportunity and creates it in Twenty CRM. The opportunity is attributed to the WhatsApp sender (when known) and inferred assignees are set when the message explicitly asks for them.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `rfq` | string | Yes | The raw RFQ message text |
| `senderNumber` | string | No | E.164 phone of the WhatsApp sender (e.g. `+918076708542`). When matched against `VerifiedNumber`, the created opportunity's `createdBy` is set to that workspace member. Falls back to the API key creator when unmatched. |

**Example request**

```json
{
  "rfq": "Need 5000 sqft warehouse in Bangalore. assign to jayanth",
  "senderNumber": "+918076708542"
}
```

**Response** `201 Created`

```json
{
  "parsed": {
    "name": "TBD - 5,000 sqft - TBD, Bangalore",
    "stage": "RFQ_RECEIVED",
    "leadSource": "DIRECT",
    "duration": "LONG_TERM",
    "city": "Bangalore",
    "repeatCustomer": false,
    "description": "Need 5000 sqft warehouse in Bangalore. assign to jayanth",
    "assignedTo": ["JAYANTH"],
    "createdBy": {
      "source": "MANUAL",
      "workspaceMemberId": "f22c1ae4-2b4b-4408-bd9e-e7d4674cf011",
      "name": "Raghav"
    }
  },
  "crm": {
    "data": {
      "createOpportunity": { "id": "cc53ed26-3928-48f4-82ea-af406a122d07" }
    }
  }
}
```

### Parsed fields

| Field | Type | Description |
|---|---|---|
| `name` | string | `Company - Space - Area, City`. `TBD` for unknown parts. |
| `stage` | enum | Defaults to `RFQ_RECEIVED`. Other values inferred only if explicitly stated. |
| `leadSource` | enum | `GODAMWALE`, `BROKER`, or `DIRECT`. |
| `duration` | enum | `LONG_TERM` (default) or `SHORT_TERM` (only if explicitly < 1 year). |
| `city` | string | Omitted if not mentioned. |
| `repeatCustomer` | boolean | `true` only if explicitly stated. |
| `companyName` | string | Omitted if not mentioned. |
| `budget` | string | Per-sqft rate as a number string. Omitted if not mentioned. |
| `description` | string | Raw RFQ text verbatim. |
| `amount` | object | `{ amountMicros, currencyCode }`. Omitted unless total deal size is explicitly mentioned. |
| `pocName` | object | `{ firstName, lastName }`. Omitted if not mentioned. |
| `pocPhoneNumber` | object | `{ primaryPhoneNumber, primaryPhoneCallingCode, primaryPhoneCountryCode }`. Omitted if not mentioned. |
| `assignedTo` | string[] | Inferred only when the message explicitly asks ("assign to X", "X please handle"). Each value is a Twenty enum (uppercased first name). Validated against `ASSIGNABLE_USERS`; unknown names are dropped. Field omitted entirely if no explicit assignment intent. |
| `createdBy` | object | Set only when `senderNumber` resolved against `VerifiedNumber`. Otherwise Twenty defaults to the API key. |

### Stage enum

`NEW_LEAD`, `RFQ_RECEIVED` *(default)*, `RFQ_NOT_RELEVANT`, `PROPOSAL_SHARED`, `FOLLOW_UP`, `SITE_VISIT`, `NEGOTIATION`, `DEAL_LOST`, `AGREEMENT_WORK`, `MONEY_COLLECTION`, `DEAL_CLOSED`.

### `assignedTo` enum

Sourced from the `ASSIGNABLE_USERS` env var. Currently: `DHAVAL`, `JAYANTH`, `NIKESH`, `RANITA`, `MANEESH`, `ARNAV`, `MANOHARI`, `NIHAS`, `RAGHAV`.

---

## `POST /webhook/twenty`

Receives opportunity create/update events from Twenty CRM. Upserts the row into the local `opportunities` table, resets reminder timers on activity, then asynchronously resolves the deal creator from Twenty REST and prepends their email to `assignee_email`.

**Request headers**

Twenty currently posts JSON bodies with `Content-Type: application/x-www-form-urlencoded` (an upstream quirk). The handler recovers the JSON regardless. Plain `application/json` also works.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Twenty opportunity UUID |
| `stage` | string | No | e.g. `RFQ_RECEIVED` |
| `assigned_to` | string | No | Comma-separated names (e.g. `"DHAVAL,RAGHAV"`); each becomes `<name>@wareongo.com` |
| `deal_name` | string | No | |
| `company` | string | No | |
| `description` | string | No | |
| `POC Name` | string | No | |
| `POC Phone Number` | string | No | |
| `created_at` | string | No | |
| `last_updated` | string | No | |

**Response** `200 OK` (returned immediately; upsert + creator resolution happen async)

```json
{ "received": true }
```

### Recipient ordering

After the upsert, the handler GETs `/rest/opportunities/{id}` from Twenty, reads `createdBy.workspaceMemberId`, and looks the user up via `VerifiedNumber.twenty_user_id`. If found, the creator's email is **prepended** to `assignee_email` (deduped, case-insensitive). At reminder send time `email.service.js` uses the first entry as `To:` and the rest as `Cc:` — so the creator becomes the primary recipient.

If creator resolution fails for any reason, the upsert is unaffected and the existing assignees still get the reminder.

---

## `POST /send-reminder`

Called by Supabase `pg_cron`. Sends one follow-up email per call, with retry/backoff on Resend errors. The Postgres cron job flips `reminder_<step>_sent` to `true` based on the response.

**Request headers**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Auth` | Shared secret. Validated against `REMINDER_SECRET` in the service env. Requests without it return `401`; the service refuses all requests with `503` if the secret isn't configured. |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `opportunityId` | string | Yes | The opportunity to remind about |
| `assigneeEmail` | string | Yes | Recipient string. May be a single email or comma-separated; the first entry becomes `To:`, the rest `Cc:`. Already includes the creator (prepended at webhook time). |
| `step` | string enum | Yes | `1h`, `1d`, or `3d` |

**Example request**

```json
{
  "opportunityId": "cc53ed26-3928-48f4-82ea-af406a122d07",
  "assigneeEmail": "raghav@wareongo.com,dhaval@wareongo.com",
  "step": "1h"
}
```

**Responses**

```json
{ "sent": true }
```
```json
{ "sent": false, "skipped": true }
```

On failure (Resend error after retries, opportunity not found, etc.) the endpoint returns a `4xx` or `5xx` with an `error` body — the cron reconciler infers failure from the HTTP status code, not from a payload field. Example:

```json
{ "error": "Internal server error" }
```

---

## `POST /email`

Ad-hoc reminder-style email send. Same recipient semantics as `/send-reminder` (comma list → first is `To:`, rest are `Cc:`).

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | string | Yes | Recipient email or comma-separated list. |
| `text` | string | Yes | Plain-text body. |
| `timePeriod` | string | Yes | One of `"1 hour"`, `"1 day"`, `"3 days"` — used to build the subject (`[<period>] RFQ Reminder`). |

**Response** `200 OK`

```json
{ "message": "Email sent", "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

> The underlying `sendMail` service supports richer fields (`subject`, `html`), but they are not accepted at the HTTP layer — `/send-reminder` is the path that uses them.

---

## Error responses

`400` — missing / malformed required field.

```json
{ "error": "Missing 'rfq' field in request body" }
```

`401` — `/send-reminder` without a valid `X-Auth`.

`5xx` — internal error (logged on the server).

```json
{ "error": "Internal server error" }
```

CRM upstream error (the controller forwards Twenty's status as a `4xx`):

```json
{ "error": "Twenty CRM API error: 400" }
```
