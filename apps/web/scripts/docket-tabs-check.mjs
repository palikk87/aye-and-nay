/**
 * The Docket's Executive and SCOTUS tabs show what we actually hold.
 *
 *   node scripts/docket-tabs-check.mjs dist     (after `bun run build`)
 *
 * WHY THIS EXISTS. Reported plainly: "the executive and SCOTUS tabs in the
 * Docket section don't show anything when clicked but there are definitely
 * things that could populate in our database."
 *
 * They were empty, and nothing was broken in the usual sense — every line
 * compiled, every request answered 200. The tabs were wired to /trending, which
 * refuses to return a record until it has five interactions on it, deliberately,
 * so that nothing gets stamped "trending" out of an empty database. On a
 * platform with no votes yet that endpoint returns NOTHING, for every branch.
 * Legislation survived because it quietly had a second source. Executive Orders
 * and Supreme Court Cases had only the one, so both rendered an empty state
 * while the database held 1,536 orders and 75 rulings.
 *
 * "Nothing is trending" is true. "No executive orders yet" is not, and that is
 * what a reader was shown.
 *
 * A typecheck cannot catch that and neither can a backend test: both endpoints
 * behaved exactly as specified. Only a browser clicking the tab can tell you
 * that a reader sees nothing.
 *
 * WHAT IT PROVES:
 *   - With NO votes anywhere — the condition that broke it — clicking Executive
 *     shows an executive order, and clicking SCOTUS shows a ruling.
 *   - The heading tells the truth about which list it is showing: "most recent"
 *     when nothing has been voted on, "most popular" once something has.
 *   - A branch we genuinely hold nothing for still says so, so this fix cannot
 *     turn into a card that invents content.
 *
 * WHAT IT TOUCHES. The database named civicvoice_population, only ever through
 * TEST_POPULATION_DATABASE_URL. It creates records prefixed "dtabs" and removes
 * them on the way out.
 */
import { launchChromium, routeApiToLocal, acceptTermsBeforeLoad } from "./chromium.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";

const DIST = process.argv[2] ?? "dist";
const BACKEND = resolve(process.cwd(), "..", "..", "backend");

const POPULATION_URL =
  process.env.TEST_POPULATION_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/civicvoice_population";

if (!/population/i.test(new URL(POPULATION_URL).pathname)) {
  console.error(`Refusing to run against "${new URL(POPULATION_URL).pathname}".`);
  process.exit(1);
}

const API_PORT = Number(process.env.DTABS_CHECK_PORT ?? 3986);
const API = `http://127.0.0.1:${API_PORT}`;
const PREFIX = "dtabs";

// Words that appear nowhere else in the archive, so a hit is this record.
const EO_TITLE = "Establishing the Bellwether Signal Office";
const CASE_TITLE = "Bellwether v. Signal Holdings";

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html",
                ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
                ".ico": "image/x-icon", ".webp": "image/webp" };

const failures = [];
function check(label, condition, detail) {
  const ok = !!condition;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  — ${String(detail).slice(0, 180)}` : ""}`);
  if (!ok) failures.push(label);
}

function db(snippet) {
  return execFileSync(
    "bun",
    [
      "-e",
      `const { PrismaClient } = require("@prisma/client");
       const prisma = new PrismaClient({ datasources: { db: { url: process.env.POP_URL } } });
       (async () => { ${snippet} await prisma.$disconnect(); })();`,
    ],
    { cwd: BACKEND, env: { ...process.env, POP_URL: POPULATION_URL }, encoding: "utf8" },
  ).trim();
}

const backendEnv = {
  ...process.env,
  NODE_ENV: "development",
  PORT: String(API_PORT),
  DATABASE_URL: POPULATION_URL,
  DIRECT_URL: POPULATION_URL,
  BACKEND_URL: API,
  BETTER_AUTH_SECRET: "docket-tabs-check-secret-not-used-anywhere-else",
  APP_ORIGINS: "*",
  APP_SCHEMES: "ayeandnay",
  MEDIA_STORAGE: "local",
  UPLOADS_DIR: join(BACKEND, ".docket-tabs-check-uploads"),
  HEALTH_SCHEMA_TTL_MS: "0",
  CIVIC_NO_BACKGROUND_SYNC: "1",
};

const api = spawn("bun", ["src/index.ts"], { cwd: BACKEND, env: backendEnv, stdio: ["ignore", "pipe", "pipe"] });
let apiLog = "";
api.stdout.on("data", (d) => { apiLog += d; });
api.stderr.on("data", (d) => { apiLog += d; });

async function waitForApi() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${API}/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`The backend never answered on ${API}.\n\n${apiLog.slice(-2000)}`);
}

function removeTheRecords() {
  try {
    db(`await prisma.governmentReference.deleteMany({ where: { masterReferenceId: { startsWith: "${PREFIX}" } } });`);
  } catch (error) {
    console.error("could not clean up:", error.message);
  }
}

let server;
let browser;

try {
  await waitForApi();
  removeTheRecords();

  /*
   * ZERO VOTES ON EITHER, which is the whole point. This is the state the
   * platform is actually in, and the state in which both tabs went blank.
   */
  db(`
    await prisma.governmentReference.create({ data: {
      masterReferenceId: "${PREFIX}-eo-1", referenceType: "executive_order", status: "active",
      title: ${JSON.stringify(EO_TITLE)}, category: "economy",
      slug: "${PREFIX}-establishing-the-bellwether-signal-office",
      signedDate: new Date("2026-02-02T00:00:00Z"),
    }});
    await prisma.governmentReference.create({ data: {
      masterReferenceId: "${PREFIX}-24-991", referenceType: "scotus_case", status: "decided",
      title: ${JSON.stringify(CASE_TITLE)}, category: "economy",
      slug: "${PREFIX}-bellwether-v-signal-holdings",
      decidedDate: new Date("2026-02-03T00:00:00Z"),
    }});
  `);

  server = createServer(async (req, res) => {
    const url = req.url.split("?")[0];
    let file = join(DIST, url === "/" ? "index.html" : url);
    try {
      if (!(await stat(file)).isFile()) throw new Error("dir");
    } catch {
      file = join(DIST, "index.html");
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
  await acceptTermsBeforeLoad(context);
  const page = await context.newPage();
  await routeApiToLocal(page, API);

  const screen = () => page.evaluate(() => document.getElementById("root")?.innerText ?? "");
  async function openTab(label) {
    await page.locator("button", { hasText: new RegExp(`^${label}$`) }).first().click();
    await page.waitForTimeout(2_000);
    return screen();
  }

  await page.goto(`${base}/discover`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#root", { timeout: 25_000 });
  await page.waitForTimeout(2_000);

  // --------------------------------------------------------- nothing voted on
  const nothingTrending = await fetch(`${API}/api/government-references/trending?limit=10`)
    .then((r) => r.json())
    .then((body) => (body.references ?? []).length);
  check("NOTHING IS TRENDING, which is the condition that emptied both tabs",
    nothingTrending === 0, `${nothingTrending} trending`);

  const executive = await openTab("Executive");
  check("THE EXECUTIVE TAB SHOWS AN ORDER WE HOLD",
    executive.includes(EO_TITLE), executive.slice(0, 220));
  check("…and does not claim we have none",
    !/No executive orders yet/i.test(executive));
  check("…and the heading says these are the newest, not the most popular",
    /most recent presidential directives/i.test(executive), executive.slice(0, 160));

  const judicial = await openTab("SCOTUS");
  check("THE SCOTUS TAB SHOWS A RULING WE HOLD",
    judicial.includes(CASE_TITLE), judicial.slice(0, 220));
  check("…and does not claim we have none",
    !/No Supreme Court cases yet/i.test(judicial));
  check("…and its heading is honest too",
    /most recent Supreme Court decisions/i.test(judicial), judicial.slice(0, 160));

  // ------------------------------------------------- once something IS popular
  //
  // The fallback must not swallow the real list. Five interactions is the floor
  // the trending endpoint enforces, so this crosses it.
  db(`await prisma.governmentReference.update({
        where: { masterReferenceId: "${PREFIX}-eo-1" },
        data: { supportVotes: 9 },
      });`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#root", { timeout: 25_000 });
  await page.waitForTimeout(2_000);

  const popular = await openTab("Executive");
  check("ONCE A RECORD IS VOTED ON, THE HEADING SAYS POPULAR AGAIN",
    /most popular presidential directives/i.test(popular), popular.slice(0, 160));
  check("…and the order is still there", popular.includes(EO_TITLE));

  // ------------------------------------------------------- and an honest empty
  //
  // The fix must not become a card that invents content: a branch we hold
  // nothing for still has to say so.
  db(`await prisma.governmentReference.deleteMany({
        where: { referenceType: "scotus_case" },
      });`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#root", { timeout: 25_000 });
  await page.waitForTimeout(2_000);

  const empty = await openTab("SCOTUS");
  check("A BRANCH WE GENUINELY HOLD NOTHING FOR STILL SAYS SO",
    /No Supreme Court cases yet/i.test(empty), empty.slice(0, 200));

  await context.close();
} catch (error) {
  console.error("\n" + (error?.stack ?? error));
  failures.push("the check itself threw");
} finally {
  removeTheRecords();
  const left = db(`console.log(await prisma.governmentReference.count({ where: { masterReferenceId: { startsWith: "${PREFIX}" } } }));`);
  check("the records this check created are gone", left === "0", left);
  if (browser) await browser.close();
  if (server) server.close();
  api.kill("SIGTERM");
}

console.log(
  failures.length === 0
    ? "\nEvery Docket tab shows what we hold."
    : `\n${failures.length} failed:\n  ${failures.join("\n  ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
