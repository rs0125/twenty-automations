import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

app.use(cors());

// Twenty CRM posts JSON but mislabels it as application/x-www-form-urlencoded
// (upstream bug). Capture the raw body for the webhook route BEFORE the global
// parsers so express.urlencoded never mangles it into a single form key. This
// sets req._body, so the json/urlencoded parsers below skip this route.
app.use("/webhook/twenty", express.text({ type: "*/*" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(routes);

export default app;
