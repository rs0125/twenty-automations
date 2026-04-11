# CRM Automations - AI RFQ Service

Backend service that parses natural-language RFQ (Request for Quotation) messages using AI and creates structured opportunities in the Twenty CRM.

## Setup

```bash
npm install
cp .env.example .env   # fill in your keys
npm run dev             # starts with --watch
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `TWENTY_CRM_BASE_URL` | Yes | Twenty CRM base URL (e.g. `https://crm.wareongo.com`) |
| `TWENTY_CRM_API_KEY` | Yes | Twenty CRM bearer token |
| `RFQ_MODEL` | No | OpenAI model override (default: `gpt-4o`) |
| `PORT` | No | Server port (default: `3000`) |
| `DATABASE_URL` | No | PostgreSQL connection string (for Prisma, not yet active) |

## API

Base URL: `http://localhost:3000`

---

### `GET /health`

Health check.

**Response** `200`

```json
{
  "status": "ok",
  "timestamp": "2026-04-10T16:00:00.000Z"
}
```

---

### `POST /rfq`

Parses an RFQ message with AI and creates an opportunity in Twenty CRM.

**Request**

```json
{
  "rfq": "RFQ in Bangalore\n\nLocation: HSR layout\nSize: 5000-10000 sqft\nSpecs: Commercial space ground floor\nBudget: 100/sft\nMore comments: Need in high street with good footfall and atleast 30ft frontage. Okay with G+1\n\nClient name: John Smith Enterprises\nPerson: John Smith\nNumber: 9876543210"
}
```

**Response** `201`

```json
{
  "parsed": {
    "name": "Bangalore - TBD",
    "stage": "RFQ_RECEIVED",
    "leadSource": "DIRECT",
    "duration": "SHORT_TERM",
    "city": "Bangalore",
    "repeatCustomer": false,
    "companyName": "John Smith Enterprises",
    "pocName": {
      "firstName": "John",
      "lastName": "Smith"
    },
    "pocPhoneNumber": {
      "primaryPhoneNumber": "9876543210",
      "primaryPhoneCallingCode": "+91",
      "primaryPhoneCountryCode": "IN"
    },
    "description": "Specs: 5000-10000 sqft commercial space ground floor, high street, 30ft frontage, G+1; Budget: 100/sft",
    "assignedTo": ""
  },
  "crm": { "..." }
}
```

**Error** `400`

```json
{ "error": "Missing 'rfq' field in request body" }
```

**Error** `500`

```json
{ "error": "Internal server error" }
```

---

## Parsed Fields

The AI extracts the following from the RFQ text. Fields with empty sentinels are stripped before sending to the CRM.

| Field | Type | Notes |
|---|---|---|
| `name` | string | `"City - Amount"` or `"City - TBD"` |
| `amount` | object | `{ amountMicros, currencyCode }`. Dropped if amount is `"0"`. Converted to micros (x1,000,000) before CRM call. |
| `closeDate` | string | ISO 8601 date. Dropped if empty. |
| `stage` | enum | Always `RFQ_RECEIVED` for incoming RFQs |
| `leadSource` | enum | `GODAMWALE`, `BROKER`, `DIRECT` |
| `duration` | enum | `LONG_TERM`, `SHORT_TERM` |
| `city` | string | Dropped if empty |
| `repeatCustomer` | boolean | Default `false` |
| `companyName` | string | Dropped if empty |
| `pocName` | object | `{ firstName, lastName }`. Dropped if both empty. |
| `pocPhoneNumber` | object | `{ primaryPhoneNumber, primaryPhoneCallingCode, primaryPhoneCountryCode }`. Defaults to `+91`/`IN`. Dropped if no number. |
| `description` | string | `"Specs: ...; Budget: ...; Duration: ...; Possession: ...; Notes: ..."` |
| `assignedTo` | string | Always blank (stripped before CRM call) |

## Architecture

```
POST /rfq
  -> rfq.controller.js
    -> rfq.service.js      (OpenAI GPT-4o structured output)
    -> twenty.service.js    (POST to Twenty CRM REST API)
  <- { parsed, crm }
```
