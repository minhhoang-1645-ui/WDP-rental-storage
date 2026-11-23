import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  require = createRequire(new URL("../package.json", import.meta.url));
const environment = { ...process.env, EXPO_NO_DOTENV: "1", CI: "1" };
for (const args of [
  [
    fileURLToPath(new URL("../node_modules/expo/bin/cli", import.meta.url)),
    "customize",
    "tsconfig.json",
  ],
  [require.resolve("typescript/bin/tsc"), "--noEmit"],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
