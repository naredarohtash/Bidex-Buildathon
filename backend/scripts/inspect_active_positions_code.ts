import fs from "fs";
import path from "path";

const filePath = path.resolve(__dirname, "../../frontend/app/[locale]/binary/components/positions/active-positions.tsx");
const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log("Printing lines 310 to 480 of active-positions.tsx:");
for (let i = 310; i <= 480; i++) {
  console.log(`${i}: ${lines[i - 1]}`);
}
