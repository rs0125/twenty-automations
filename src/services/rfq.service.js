import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const opportunitySchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Format: 'Size - Location, City (ClientName)'. E.g. '5,000-10,000 sqft - HSR Layout, Bangalore (Acme Corp)'. NEVER prefix with deal type like 'Warehouse RFQ'. Use TBD for unknown parts." },
    amount: {
      type: "object",
      properties: {
        amountMicros: { type: "string", description: "Budget amount as a plain number string — either total budget or rate per sqft, whichever is mentioned. E.g. Rs 2,20,000 → \"220000\", Rs 25/sqft → \"25\". Use \"0\" if not mentioned." },
        currencyCode: { type: "string", enum: ["INR", "USD", "EUR"] },
      },
      required: ["amountMicros", "currencyCode"],
      additionalProperties: false,
    },
    closeDate: { type: "string", description: "Possession/close date in ISO 8601 format. If not mentioned, use empty string." },
    stage: { type: "string", enum: ["NEW_LEAD", "RFQ_RECEIVED", "RFQ_NOT_RELEVANT", "PROPOSAL_SHARED", "FOLLOW_UP"] },
    leadSource: { type: "string", enum: ["GODAMWALE", "BROKER", "DIRECT"] },
    duration: { type: "string", enum: ["LONG_TERM", "SHORT_TERM"] },
    city: { type: "string", description: "City mentioned in the RFQ" },
    repeatCustomer: { type: "boolean" },
    companyName: { type: "string", description: "Company or business name of the client. Use empty string if not mentioned." },
    pocName: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "First name of the point of contact. Use empty string if not mentioned." },
        lastName: { type: "string", description: "Last name of the point of contact. Use empty string if not mentioned." },
      },
      required: ["firstName", "lastName"],
      additionalProperties: false,
    },
    pocPhoneNumber: {
      type: "object",
      properties: {
        primaryPhoneNumber: { type: "string", description: "Phone number without country code. Use empty string if not mentioned." },
        primaryPhoneCallingCode: { type: "string", description: "Calling code. Default \"+91\" for Indian numbers." },
        primaryPhoneCountryCode: { type: "string", description: "ISO country code. Default \"IN\" for Indian numbers." },
      },
      required: ["primaryPhoneNumber", "primaryPhoneCallingCode", "primaryPhoneCountryCode"],
      additionalProperties: false,
    },
    description: { type: "string", description: "Compact summary. Format: 'Specs: ...; Duration: ...; Possession: ...'. Include warehouse specs, lock-in period, and possession/start date." },
  },
  required: ["name", "amount", "closeDate", "stage", "leadSource", "duration", "city", "repeatCustomer", "companyName", "pocName", "pocPhoneNumber", "description"],
  additionalProperties: false,
};

export async function parseRfq(rfqText) {
  const today = new Date().toISOString().split("T")[0];

  const completion = await openai.chat.completions.create({
    model: process.env.RFQ_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert RFQ parser for a warehousing and logistics CRM (WareOnGo). Your job is to extract structured opportunity data from natural language RFQ messages — these may come from emails, WhatsApp, broker calls, or internal notes. They are often informal, may be in Hinglish, and may contain incomplete information.

Today's date is ${today}.

CRITICAL RULES:
- Only extract information that is EXPLICITLY stated or can be directly inferred from the text.
- If a field's value cannot be determined from the RFQ, use the designated empty sentinel: "" for strings, "0" for amountMicros, false for booleans.
- NEVER guess, hallucinate, or fill in plausible-sounding data. Missing data is better than wrong data.

FIELD INSTRUCTIONS:
- name: Format STRICTLY as "Size - Location, City (ClientName)". NEVER prefix with deal type like "Warehouse RFQ", "Cold Storage RFQ", etc. WRONG: "Warehouse RFQ - 5,000 sqft - HSR Layout, Bangalore (Acme Corp)". CORRECT: "5,000 sqft - HSR Layout, Bangalore (Acme Corp)". Size is the area/capacity requested with Indian number formatting (use range if given, e.g. "5,000-10,000 sqft"). Location is the specific locality/area within the city. Use "TBD" for any unknown part. If client name is unknown, omit the parentheses entirely.
- amount.amountMicros: The budget amount as a plain number string — no multiplication. This can be either a total budget or a rate per square foot, whichever is mentioned. E.g. Rs 2,20,000 → "220000". 5 lakhs → "500000". 1.5 crore → "15000000". Rs 25/sqft → "25". Use "0" if not mentioned.
- amount.currencyCode: Almost always "INR" unless USD/EUR is explicitly stated.
- closeDate: Possession or move-in date in ISO 8601 (e.g. "2026-06-01T00:00:00.000Z"). Use "" if not mentioned. Interpret "immediate" as today's date (${today}T00:00:00.000Z).
- stage: Always "RFQ_RECEIVED" for incoming RFQs.
- leadSource: "GODAMWALE" if Godamwale/platform is mentioned, "BROKER" if a broker/agent/referral is mentioned, "DIRECT" if the client reached out directly or source is unclear.
- duration: "LONG_TERM" if lock-in/duration is 1 year or above. "SHORT_TERM" for anything under 1 year, spot, one-time, or if impossible to determine.
- city: Exact city name. Use "" if not mentioned.
- repeatCustomer: true ONLY if the text explicitly says existing client, repeat customer, or similar. Default false.
- companyName: The company or business name of the client/requester. Use "" if not mentioned.
- pocName.firstName: First name of the point of contact. Use "" if not mentioned.
- pocName.lastName: Last name of the point of contact. Use "" if not mentioned. If only a single name is given, use it as firstName and leave lastName as "".
- pocPhoneNumber.primaryPhoneNumber: Phone number digits (without country code). Use "" if not mentioned.
- pocPhoneNumber.primaryPhoneCallingCode: Default "+91" (Indian numbers) unless a different country code is explicitly mentioned.
- pocPhoneNumber.primaryPhoneCountryCode: Default "IN" (India) unless a different country is explicitly mentioned.
- description: Compact structured summary of ONLY the details present. Format: "Specs: <type/size/compliance>; Budget: <rate or total>; Duration: <lock-in>; Possession: <date>; Notes: <other requirements>". Omit sections that have no data. Include details like compliant/non-compliant, BTS/RTS, pallet positions, area in sqft, temperature controlled, budget/rate per sqft, frontage, floor preference, and any other specific requirements mentioned.`,
      },
      { role: "user", content: rfqText },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "opportunity",
        strict: true,
        schema: opportunitySchema,
      },
    },
  });

  let parsed;
  try {
    parsed = JSON.parse(completion.choices[0].message.content);
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  // Keep assignedTo blank for now
  parsed.assignedTo = "";

  // Strip fields the AI couldn't determine (empty sentinels)
  if (!parsed.closeDate) delete parsed.closeDate;
  if (!parsed.city) delete parsed.city;
  if (!parsed.description) delete parsed.description;
  if (!parsed.companyName) delete parsed.companyName;
  if (parsed.amount?.amountMicros === "0") delete parsed.amount;

  // Strip empty poc fields
  if (!parsed.pocName?.firstName && !parsed.pocName?.lastName) {
    delete parsed.pocName;
  }
  if (!parsed.pocPhoneNumber?.primaryPhoneNumber) {
    delete parsed.pocPhoneNumber;
  }

  return parsed;
}
