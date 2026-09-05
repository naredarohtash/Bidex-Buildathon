import fs from "fs";
import path from "path";

const filePath = path.resolve(__dirname, "../../frontend/app/[locale]/binary/components/positions/active-positions.tsx");
const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log("Searching active-positions.tsx for timer/countdown/rendering logic...");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("time") || line.includes("sec") || line.includes("interval") || line.includes("expiry") || line.includes("Timer") || line.includes("date")) {
    console.log(`${i + 1}: ${line.trim()}`);
  }
}
