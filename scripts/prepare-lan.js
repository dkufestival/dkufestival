const fs = require("fs");
const os = require("os");
const path = require("path");

const interfaces = os.networkInterfaces();
const preferredNames = ["en0", "Wi-Fi", "Ethernet"];

function findAddress() {
  for (const name of preferredNames) {
    const address = interfaces[name]?.find(
      (item) => item.family === "IPv4" && !item.internal,
    );
    if (address) return { ...address, name };
  }

  for (const [name, addresses] of Object.entries(interfaces)) {
    const address = addresses?.find(
      (item) => item.family === "IPv4" && !item.internal,
    );
    if (address) return { ...address, name };
  }

  return null;
}

const network = findAddress();

if (!network) {
  console.error(
    "[LAN] Wi-Fi/LAN IPv4 주소를 찾지 못했습니다. 네트워크 연결을 확인하세요.",
  );
  process.exit(1);
}

const envPath = path.join(__dirname, "..", "app", ".env");
const serverUrl = `http://${network.address}:3000`;
const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const line = `EXPO_PUBLIC_SERVER_URL=${serverUrl}`;
const next = current.match(/^EXPO_PUBLIC_SERVER_URL=.*$/m)
  ? current.replace(/^EXPO_PUBLIC_SERVER_URL=.*$/m, line)
  : `${current.trimEnd()}${current.trim() ? "\n" : ""}${line}\n`;

fs.writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`);

console.log(`[LAN] API/Socket URL: ${serverUrl}`);
console.log("[LAN] Expo URL은 Metro 시작 후 표시됩니다.");

if (network.netmask === "255.255.255.255" || network.cidr?.endsWith("/32")) {
  console.warn(
    `[LAN 경고] ${network.name}의 주소가 ${network.cidr ?? network.address}입니다.`,
  );
  console.warn(
    "[LAN 경고] 휴대폰 핫스팟은 연결 기기 간 통신을 차단할 수 있습니다.",
  );
  console.warn(
    `[LAN 확인] 휴대폰 브라우저에서 ${serverUrl}/ 접속이 안 되면 일반 Wi-Fi를 사용하세요.`,
  );
}
