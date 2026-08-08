const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.join(__dirname, "..");
const envPath = path.join(rootDir, "app", ".env");
const tunnelUrlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const originalEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
let cloudflared;
let expo;
let stopping = false;

function checkServer() {
  return new Promise((resolve, reject) => {
    const request = http.get("http://localhost:3000/", (response) => {
      response.resume();
      response.statusCode && response.statusCode < 500
        ? resolve()
        : reject(new Error(`서버 응답 오류: HTTP ${response.statusCode}`));
    });
    request.setTimeout(3000, () => request.destroy(new Error("서버 응답 시간 초과")));
    request.on("error", reject);
  });
}

function updateEnv(serverUrl) {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const line = `EXPO_PUBLIC_SERVER_URL=${serverUrl}`;
  const next = current.match(/^EXPO_PUBLIC_SERVER_URL=.*$/m)
    ? current.replace(/^EXPO_PUBLIC_SERVER_URL=.*$/m, line)
    : `${current.trimEnd()}${current.trim() ? "\n" : ""}${line}\n`;

  fs.writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`);
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  expo?.kill("SIGINT");
  cloudflared?.kill("SIGINT");
  fs.writeFileSync(envPath, originalEnv);
  console.log("\n[Tunnel] 종료되어 app/.env를 이전 서버 주소로 복구했습니다.");
}

async function main() {
  try {
    await checkServer();
  } catch (error) {
    console.error("[Tunnel] 백엔드 서버가 실행 중이 아닙니다.");
    console.error("[Tunnel] 먼저 `cd server && npm start`를 실행하세요.");
    console.error(`[Tunnel] 원인: ${error.message}`);
    process.exit(1);
  }

  console.log("[Tunnel] API/Socket.IO 공개 HTTPS 주소를 생성 중입니다...");
  cloudflared = spawn(
    "cloudflared",
    ["tunnel", "--url", "http://localhost:3000", "--no-autoupdate"],
    { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"] },
  );

  let started = false;
  const handleOutput = (chunk) => {
    const output = chunk.toString();
    process.stdout.write(output);
    const match = output.match(tunnelUrlPattern);
    if (!match || started) return;

    started = true;
    const serverUrl = match[0];
    updateEnv(serverUrl);
    console.log(`\n[Tunnel] API/Socket URL: ${serverUrl}`);
    console.log("[Tunnel] Expo Go용 QR 코드를 생성합니다...");

    expo = spawn("npm", ["--prefix", "app", "run", "start:tunnel"], {
      cwd: rootDir,
      stdio: "inherit",
    });
    expo.on("exit", (code) => {
      stopChildren();
      process.exit(code ?? 0);
    });
  };

  cloudflared.stdout.on("data", handleOutput);
  cloudflared.stderr.on("data", handleOutput);
  cloudflared.on("error", (error) => {
    console.error(`[Tunnel] cloudflared 실행 실패: ${error.message}`);
    process.exit(1);
  });
  cloudflared.on("exit", (code) => {
    if (!started) {
      console.error(`[Tunnel] 공개 주소 생성 실패 (종료 코드: ${code})`);
      process.exit(code ?? 1);
    }
    if (!stopping) {
      stopChildren();
      process.exit(code ?? 1);
    }
  });
}

process.on("SIGINT", () => {
  stopChildren();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopChildren();
  process.exit(0);
});

main();
