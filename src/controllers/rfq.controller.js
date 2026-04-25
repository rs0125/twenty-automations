import { parseRfq } from "../services/rfq.service.js";
import { createOpportunityFromData } from "../services/twenty.service.js";
import { findUserByPhone } from "../services/users.service.js";

export async function processRfq(req, res) {
  const { rfq, senderNumber } = req.body;

  if (!rfq) {
    return res.status(400).json({ error: "Missing 'rfq' field in request body" });
  }

  try {
    const parsed = await parseRfq(rfq);

    // Resolve the WhatsApp sender to a Twenty workspace member so the
    // opportunity is attributed to whoever actually sent the RFQ. If we
    // can't resolve them (unknown number, or known number with no Twenty
    // mapping yet), let Twenty default to the API key — don't drop the RFQ.
    if (senderNumber) {
      const user = await findUserByPhone(senderNumber);
      if (user?.twenty_user_id) {
        parsed.createdBy = {
          source: "MANUAL",
          workspaceMemberId: user.twenty_user_id,
          name: user.name,
        };
      } else {
        console.warn(
          `[rfq] no twenty mapping for senderNumber=${senderNumber} (matched=${Boolean(user)})`
        );
      }
    }

    const result = await createOpportunityFromData(parsed);
    res.status(201).json({ parsed, crm: result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: status >= 500 ? "Internal server error" : err.message,
    });
  }
}
