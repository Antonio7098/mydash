import { summaryText } from "./summary.js";

const response = await fetch("../data/use-cases.json");
const rows = await response.json();
document.querySelector("#app").textContent = summaryText(rows);
document.documentElement.dataset.exportTestReady = "true";
