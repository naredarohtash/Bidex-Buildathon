import fs from "fs";
import path from "path";

const filePath = path.resolve(__dirname, "../../frontend/app/[locale]/binary/components/positions/active-positions.tsx");
const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log("Searching for profitLossData in active-positions.tsx...");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("profitLossData")) {
    console.log(`${i + 1}: ${lines[i].trim()}`);
  }
}
