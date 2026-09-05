const fs = require("fs-extra");
const path = require("path");

const srcDir = path.join(__dirname, "..", "dist", "api");
const destDir = path.join(__dirname, "..", "dist", "src", "api");

async function main() {
  try {
    if (await fs.pathExists(srcDir)) {
      console.log(`Copying compiled files from ${srcDir} to ${destDir}...`);
      await fs.ensureDir(destDir);
      await fs.copy(srcDir, destDir, { overwrite: true });
      console.log("Copy completed successfully!");
    } else {
      console.warn(`Source directory ${srcDir} does not exist. Run build first.`);
    }
  } catch (error) {
    console.error("Error during copy-build:", error);
    process.exit(1);
  }
}

main();
