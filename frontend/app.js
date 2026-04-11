const API_URL = "http://localhost:3000";

const rfqInput = document.getElementById("rfqInput");
const submitBtn = document.getElementById("submitBtn");
const status = document.getElementById("status");
const result = document.getElementById("result");
const fields = document.getElementById("fields");
const jsonOutput = document.getElementById("jsonOutput");
const jsonToggle = document.getElementById("jsonToggle");

submitBtn.addEventListener("click", submitRfq);

rfqInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitRfq();
});

jsonToggle.addEventListener("click", () => {
  jsonOutput.classList.toggle("visible");
});

async function submitRfq() {
  const rfq = rfqInput.value.trim();

  if (!rfq) {
    status.textContent = "Please enter an RFQ message";
    status.className = "status error";
    return;
  }

  submitBtn.disabled = true;
  status.textContent = "Parsing...";
  status.className = "status";
  result.classList.remove("visible");

  try {
    const res = await fetch(`${API_URL}/rfq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfq }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    renderResult(data);
    status.textContent = "Opportunity created";
    status.className = "status success";
  } catch (err) {
    status.textContent = err.message;
    status.className = "status error";
  } finally {
    submitBtn.disabled = false;
  }
}

function renderResult(data) {
  const p = data.parsed;

  const rows = [
    ["Name", p.name],
    ["Stage", p.stage],
    ["Lead Source", p.leadSource],
    ["Duration", p.duration],
    ["City", p.city || "-"],
    ["Amount", p.amount ? `${p.amount.amountMicros} ${p.amount.currencyCode}` : "-"],
    ["Company", p.companyName || "-"],
    ["POC", p.pocName ? `${p.pocName.firstName} ${p.pocName.lastName}`.trim() : "-"],
    ["Phone", p.pocPhoneNumber ? `${p.pocPhoneNumber.primaryPhoneCallingCode} ${p.pocPhoneNumber.primaryPhoneNumber}` : "-"],
    ["Repeat Customer", p.repeatCustomer ? "Yes" : "No"],
    ["Close Date", p.closeDate || "-"],
    ["Description", p.description || "-"],
    ["CRM ID", data.crm?.data?.createOpportunity?.id || "-"],
  ];

  fields.innerHTML = rows
    .map(([k, v]) => `<div class="field"><span class="field-key">${k}</span><span class="field-value">${v}</span></div>`)
    .join("");

  jsonOutput.textContent = JSON.stringify(data, null, 2);
  jsonOutput.classList.remove("visible");
  result.classList.add("visible");
}
