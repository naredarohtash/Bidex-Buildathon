import fs from "fs";
import path from "path";

const filePath = path.resolve(__dirname, "../../backend/api/exchange/market/index.ws.ts");
const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log("Searching for flushInterval declaration...");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("flushInterval")) {
    console.log(`${i + 1}: ${lines[i].trim()}`);
  }
}
