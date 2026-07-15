import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { extname, resolve, sep } from "node:path";

const outputRoot = resolve(process.cwd(), "out");
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath = process.env.SMOKE_BASE_PATH
  ?? (process.env.GITHUB_ACTIONS === "true" && repositoryName && !repositoryName.endsWith(".github.io")
    ? `/${repositoryName}`
    : "");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function reservePort() {
  const server = createTcpServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error("Could not reserve a port for geckodriver.");
  return port;
}

async function startStaticServer() {
  await stat(resolve(outputRoot, "index.html"));

  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
        pathname = pathname.slice(basePath.length) || "/";
      }
      if (pathname.endsWith("/")) pathname += "index.html";

      const filePath = resolve(outputRoot, `.${pathname}`);
      if (filePath !== outputRoot && !filePath.startsWith(`${outputRoot}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": fileStats.size,
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (typeof address !== "object" || !address) throw new Error("Static server did not expose a port.");
  return { server, port: address.port };
}

async function webdriverRequest(driverUrl, path, method = "GET", body) {
  const response = await fetch(`${driverUrl}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.value?.error) {
    const message = payload.value?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(`WebDriver ${method} ${path} failed: ${message}`);
  }
  return payload.value;
}

async function waitForDriver(driverUrl, processOutput) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (processOutput.exitCode !== null) {
      throw new Error(`geckodriver exited before becoming ready (code ${processOutput.exitCode}).`);
    }
    try {
      const status = await webdriverRequest(driverUrl, "/status");
      if (status?.ready) return;
    } catch {
      // geckodriver has not opened its HTTP listener yet.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for geckodriver to become ready.");
}

async function execute(driverUrl, sessionId, script, args = []) {
  return webdriverRequest(driverUrl, `/session/${sessionId}/execute/sync`, "POST", { script, args });
}

async function waitFor(driverUrl, sessionId, description, script, predicate = Boolean, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await execute(driverUrl, sessionId, script);
    if (predicate(lastValue)) return lastValue;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}. Last value: ${JSON.stringify(lastValue)}`);
}

async function runSmokeTest() {
  const { server, port: staticPort } = await startStaticServer();
  const driverPort = await reservePort();
  const driverUrl = `http://127.0.0.1:${driverPort}`;
  const appUrl = `http://127.0.0.1:${staticPort}${basePath}/`;
  const geckodriver = spawn(process.env.GECKODRIVER_PATH ?? "geckodriver", ["--port", String(driverPort)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let driverLog = "";
  geckodriver.stdout.on("data", (chunk) => { driverLog += chunk; });
  geckodriver.stderr.on("data", (chunk) => { driverLog += chunk; });

  let sessionId;
  try {
    await waitForDriver(driverUrl, geckodriver);
    const session = await webdriverRequest(driverUrl, "/session", "POST", {
      capabilities: {
        alwaysMatch: {
          browserName: "firefox",
          acceptInsecureCerts: true,
          "moz:firefoxOptions": { args: ["-headless"] },
        },
      },
    });
    sessionId = session.sessionId;
    await webdriverRequest(driverUrl, `/session/${sessionId}/url`, "POST", { url: appUrl });

    await waitFor(driverUrl, sessionId, "the class chooser", "return document.querySelectorAll('.class-choice').length", (count) => count > 0);
    await execute(driverUrl, sessionId, "document.querySelector('.class-choice').click()");
    await waitFor(driverUrl, sessionId, "the specialization chooser", "return document.querySelectorAll('.spec-choice').length", (count) => count > 0);
    await execute(driverUrl, sessionId, "document.querySelector('.spec-choice').click()");

    await waitFor(
      driverUrl,
      sessionId,
      "the head equipment slot",
      "return Boolean([...document.querySelectorAll('button')].find((element) => element.getAttribute('aria-label') === 'Choose item for HEAD'))",
    );
    await execute(
      driverUrl,
      sessionId,
      "[...document.querySelectorAll('button')].find((element) => element.getAttribute('aria-label') === 'Choose item for HEAD').click()",
    );

    const itemCount = await waitFor(
      driverUrl,
      sessionId,
      "real head-slot item rows from the catalog",
      "return { rows: document.querySelectorAll('.result-row').length, label: document.querySelector('.search-box kbd')?.textContent ?? '', body: document.body.innerText.slice(-500) }",
      (value) => value.rows > 100 && /^\d+ items$/.test(value.label),
    );
    const resources = await execute(
      driverUrl,
      sessionId,
      "return performance.getEntriesByType('resource').map((entry) => entry.name)",
    );
    if (!resources.some((url) => url.includes("/data/catalog/manifest.json"))) {
      throw new Error("The planner rendered without requesting the catalog manifest.");
    }
    if (!resources.some((url) => url.includes("/data/catalog/slots/head.json"))) {
      throw new Error("The planner rendered without requesting the head catalog shard.");
    }

    const equippedName = await execute(driverUrl, sessionId, `
      const selected = document.querySelector('.result-row.selected') ?? document.querySelector('.result-row');
      const name = selected?.querySelector('.font-semibold')?.textContent?.trim();
      selected?.click();
      [...document.querySelectorAll('button')].find((element) => element.textContent?.includes('Equip item'))?.click();
      return name;
    `);
    if (!equippedName) throw new Error("Could not identify the item selected by the planner.");

    await waitFor(
      driverUrl,
      sessionId,
      "the selected item to be equipped",
      `return [...document.querySelectorAll('button')].find((element) => element.getAttribute('aria-label') === 'Choose item for HEAD')?.querySelector('.item-name')?.textContent?.trim()`,
      (name) => name === equippedName,
    );
    await sleep(500);
    await webdriverRequest(driverUrl, `/session/${sessionId}/url`, "POST", { url: appUrl });
    await waitFor(
      driverUrl,
      sessionId,
      "the equipped item to survive a page reload",
      `return {
        chooserOpen: Boolean(document.querySelector('.class-choice')),
        name: [...document.querySelectorAll('button')].find((element) => element.getAttribute('aria-label') === 'Choose item for HEAD')?.querySelector('.item-name')?.textContent?.trim() ?? ''
      }`,
      (value) => !value.chooserOpen && value.name === equippedName,
    );

    process.stdout.write(`Firefox planner smoke test passed: ${itemCount.rows} head items rendered; ${equippedName} persisted after reload.\n`);
  } catch (error) {
    if (sessionId) {
      const diagnostics = await execute(
        driverUrl,
        sessionId,
        "return { title: document.title, url: location.href, body: document.body?.innerText?.slice(0, 1500) ?? '', resources: performance.getEntriesByType('resource').map((entry) => entry.name).slice(-20) }",
      ).catch(() => undefined);
      if (diagnostics) process.stderr.write(`Browser diagnostics:\n${JSON.stringify(diagnostics, null, 2)}\n`);
    }
    if (driverLog) process.stderr.write(`geckodriver output:\n${driverLog.slice(-4000)}\n`);
    throw error;
  } finally {
    if (sessionId) {
      await webdriverRequest(driverUrl, `/session/${sessionId}`, "DELETE").catch(() => undefined);
    }
    geckodriver.kill("SIGTERM");
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

runSmokeTest().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
