import fs from "fs";
import path from "path";

const filePath = path.resolve(__dirname, "../../frontend/app/[locale]/binary/components/positions/active-positions.tsx");
const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log("Printing lines 675 to 705:");
for (let i = 675; i <= 705; i++) {
  console.log(`${i}: ${lines[i - 1]}`);
}
