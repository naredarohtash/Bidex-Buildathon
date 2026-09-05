import fs from "fs";
import path from "path";

const filePath = path.resolve(__dirname, "../../frontend/store/trade/use-binary-store.ts");
const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log("Searching for interface BinaryState in use-binary-store.ts...");
let found = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("interface BinaryState") || lines[i].includes("type BinaryState")) {
    found = true;
    console.log(`Line ${i + 1}: ${lines[i]}`);
    const start = Math.max(0, i - 2);
    const end = Math.min(lines.length - 1, i + 35);
    for (let j = start; j <= end; j++) {
      console.log(`${j + 1}: ${lines[j]}`);
    }
  }
}
if (!found) {
  console.log("BinaryState definition not found.");
}
