# API Documentation

**Base URL:** `https://twenty-automations.onrender.com`

---

## Health Check

### `GET /health`

Returns service status.

**Response** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2026-04-11T10:30:00.000Z"
}
```

---

## Parse RFQ

### `POST /rfq`

Parses a natural-language RFQ message into a structured opportunity and creates it in Twenty CRM.

**Request Headers**

| Header | Value |
|---|---|
| Content-Type | `application/json` |

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `rfq` | string | Yes | The raw RFQ message text |

**Example Request**

```json
{
  "rfq": "RFQ in Bangalore\n\nLocation: HSR layout\nSize: 5000-10000 sqft\nBudget: 100/sft\nClient name: Ramesh Enterprises\nPerson: Ramesh\nNumber: 89884347392"
}
```

**Response** `201 Created`

```json
{
  "parsed": {
    "name": "Ramesh Enterprises - 5,000-10,000 sqft - HSR Layout, Bangalore",
    "stage": "RFQ_RECEIVED",
    "leadSource": "DIRECT",
    "duration": "LONG_TERM",
    "city": "Bangalore",
    "repeatCustomer": false,
    "companyName": "Ramesh Enterprises",
    "pocName": {
      "firstName": "Ramesh",
      "lastName": ""
    },
    "pocPhoneNumber": {
      "primaryPhoneNumber": "89884347392",
      "primaryPhoneCallingCode": "+91",
      "primaryPhoneCountryCode": "IN"
    },
    "budget": "100",
    "description": "RFQ in Bangalore\n\nLocation: HSR layout\nSize: 5000-10000 sqft\nBudget: 100/sft\nClient name: Ramesh Enterprises\nPerson: Ramesh\nNumber: 89884347392"
  },
  "crm": {
    "data": {
      "createOpportunity": {
        "id": "cc53ed26-3928-48f4-82ea-af406a122d07"
      }
    }
  }
}
```

---

## Parsed Fields Reference

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Format: `Company - Space - Area, City`. Uses `TBD` for unknown parts. |
| `stage` | string enum | Deal stage. Defaults to `RFQ_RECEIVED`. |
| `leadSource` | string enum | `GODAMWALE`, `BROKER`, or `DIRECT`. |
| `duration` | string enum | `LONG_TERM` (default) or `SHORT_TERM` (only if explicitly < 1 year). |
| `city` | string | City name. Omitted if not mentioned. |
| `repeatCustomer` | boolean | `true` only if explicitly stated. Defaults to `false`. |
| `companyName` | string | Client company name. Omitted if not mentioned. |
| `budget` | string | Budget per sqft as a number string. Omitted if not mentioned. |
| `description` | string | Raw RFQ text verbatim. |

### `amount` (omitted if total deal size not mentioned)

| Field | Type | Description |
|---|---|---|
| `amountMicros` | string | Total deal size as a plain number string (converted to micros before CRM push). |
| `currencyCode` | string | `INR`, `USD`, or `EUR`. |

### `pocName` (omitted if no name mentioned)

| Field | Type | Description |
|---|---|---|
| `firstName` | string | First name of point of contact. |
| `lastName` | string | Last name. Empty string if only one name given. |

### `pocPhoneNumber` (omitted if no phone mentioned)

| Field | Type | Description |
|---|---|---|
| `primaryPhoneNumber` | string | Phone number without country code. |
| `primaryPhoneCallingCode` | string | Calling code (default `+91`). |
| `primaryPhoneCountryCode` | string | ISO country code (default `IN`). |

### Stage Enum Values

| Value | Description |
|---|---|
| `NEW_LEAD` | New lead |
| `RFQ_RECEIVED` | RFQ received (default) |
| `RFQ_NOT_RELEVANT` | RFQ not relevant |
| `PROPOSAL_SHARED` | Proposal shared |
| `FOLLOW_UP` | Follow up |
| `SITE_VISIT` | Site visit |
| `NEGOTIATION` | Negotiation |
| `DEAL_LOST` | Deal lost |
| `AGREEMENT_WORK` | Agreement work |
| `MONEY_COLLECTION` | Money collection |
| `DEAL_CLOSED` | Deal closed |

### Assigned To Enum Values (CRM field, not set by parser)

`DHAVAL`, `JAYANTH`, `NIKESH`, `RANITA`, `MANEESH`, `ARNAV`, `MANOHARI`, `NIHAS`, `RAGHAV`

---

## Error Responses

### `400 Bad Request`

```json
{
  "error": "Missing 'rfq' field in request body"
}
```

### `500 Internal Server Error`

```json
{
  "error": "Internal server error"
}
```

### CRM API Error (4xx)

```json
{
  "error": "Twenty CRM API error: 400"
}
```
