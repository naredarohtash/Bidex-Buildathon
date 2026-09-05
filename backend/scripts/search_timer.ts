import fs from "fs";
import path from "path";

const projectRoot = path.resolve(__dirname, "../../");

function walkDir(dir: string, fileCallback: (filePath: string) => void) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const res = path.resolve(dir, file.name);
    if (file.isDirectory()) {
      if (file.name !== "node_modules" && file.name !== ".next" && file.name !== "dist" && file.name !== ".git") {
        walkDir(res, fileCallback);
      }
    } else if (file.isFile() && (file.name.endsWith(".ts") || file.name.endsWith(".tsx"))) {
      fileCallback(res);
    }
  }
}

console.log("Searching for countdown, interval, or timer logic in active positions components...");
walkDir(projectRoot, (filePath) => {
  if (filePath.includes("node_modules") || filePath.includes("dist") || filePath.includes("backend")) return;
  const content = fs.readFileSync(filePath, "utf-8");
  if (content.includes("positions") || content.includes("order") || content.includes("expiry")) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("setInterval") || lines[i].includes("seconds") || lines[i].includes("timeLeft") || lines[i].includes("countdown")) {
        console.log(`${path.relative(projectRoot, filePath)}:${i + 1} - ${lines[i].trim()}`);
      }
    }
  }
});
