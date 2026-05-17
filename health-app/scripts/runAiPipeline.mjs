import { spawnSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const aiServiceDir = path.join(rootDir, "ai-service");

const args = process.argv.slice(2);
const augment = args.find((a) => a.startsWith("--augment=")) || "--augment=12";
const minRows = args.find((a) => a.startsWith("--minRows=")) || "--minRows=50000";

const runOrThrow = (command, commandArgs, cwd) => {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${commandArgs.join(" ")}`);
  }
};

const tryPython = (pyArgs, cwd) => {
  const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  for (const cmd of candidates) {
    const result = spawnSync(cmd, pyArgs, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status === 0) return cmd;
  }
  throw new Error("No working Python command found. Install Python and ensure it is in PATH.");
};

try {
  console.log("1/4 Exporting AI training data from Mongo...");
  runOrThrow("node", ["scripts/exportTrainingData.js", augment, minRows], backendDir);

  console.log("2/4 Installing AI Python dependencies...");
  const pythonCmdForPip = tryPython(["-m", "pip", "install", "-r", "requirements.txt"], aiServiceDir);

  console.log("3/4 Training AI models...");
  runOrThrow(pythonCmdForPip, ["train.py"], aiServiceDir);

  console.log("4/4 Starting AI service on port 8000...");
  const server = spawn(
    pythonCmdForPip,
    ["-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
    {
      cwd: aiServiceDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  server.on("exit", (code) => {
    process.exit(code ?? 0);
  });
} catch (err) {
  console.error(`AI pipeline failed: ${err.message}`);
  process.exit(1);
}
