import fs from "fs";
import path from "path";

const filePath = path.resolve(__dirname, "../../backend/api/exchange/market/index.ws.ts");
const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log("Searching for bufferInterval or flushInterval in market/index.ws.ts...");
let found = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("bufferInterval") || lines[i].includes("flushInterval") || lines[i].includes("Interval")) {
    found = true;
    console.log(`Line ${i + 1}: ${lines[i]}`);
    const start = Math.max(0, i - 5);
    const end = Math.min(lines.length - 1, i + 35);
    for (let j = start; j <= end; j++) {
      console.log(`${j + 1}: ${lines[j]}`);
    }
  }
}
if (!found) {
  console.log("Not found.");
}
