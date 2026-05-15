import { processDailySummary } from "./src/services/daily-summary.service.js";

async function main() {
  console.log("Starting dry run...");
  const result = await processDailySummary({
    window: "morning",
    dryRunEmail: "raghav@wareongo.com",
  });
  console.log("Dry run finished with result:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during dry run:", err);
  process.exit(1);
});
