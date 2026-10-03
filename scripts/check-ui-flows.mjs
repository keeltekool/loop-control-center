// Click-through of Loop Control Center (CLAUDE.md §2) at 375 and 1440: real login, Due now, trigger chip copy,
// the reminder email preview. Writes nothing (the preview doesn't send).
// Usage: node scripts/check-ui-flows.mjs <baseUrl>   (LOGIN_PASSWORD from .env.local)
import { createRequire } from "node:module";

const { chromium } = createRequire("C:/Users/Kasutaja/.claude/scripts/")("playwright");

process.loadEnvFile(".env.local");
const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.LOGIN_PASSWORD;
if (!PASSWORD) { console.error("LOGIN_PASSWORD not set"); process.exit(1); }

let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split("\n")[0]}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
for (const width of [375, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 812 : 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dueSection = () => page.locator("div.mb-6", { has: page.getByRole("heading", { name: "Due now" }) });

  await step(`${width}: logged out, the dashboard redirects to login`, async () => {
    await page.goto(BASE);
    await page.waitForURL(/\/login/);
  });
  await step(`${width}: the reminder route refuses a request without a token`, async () => {
    const res = await page.request.get(`${BASE}/api/cron/reminder?preview=1`);
    expect(res.status() === 401, `answered ${res.status()}`);
  });
  await step(`${width}: login lands on the dashboard`, async () => {
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    // The login page has the same heading: wait for the loaded dashboard (a project header "N loops").
    await page.getByText(/^\d+ loops?$/).first().waitFor({ timeout: 60000 });
  });

  let emailDue = [];
  await step(`${width}: the email preview renders and lists its due loops`, async () => {
    const res = await page.request.get(`${BASE}/api/cron/reminder?preview=1`);
    expect(res.ok(), `preview answered ${res.status()}`);
    const html = await res.text();
    expect(html.includes("Open Loop Control Center"), "no dashboard link in the email");
    const due = html.split("Coming up")[0];
    emailDue = [...due.matchAll(/font-weight:600;color:#0f172a">(.*?) <span/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const count = Number(html.match(/<h1[^>]*>(\d+) loops? due/)?.[1] ?? 0);
    expect(emailDue.length === count, `heading says ${count}, rows ${emailDue.length}`);
  });
  await step(`${width}: Due now on the dashboard lists the same loops as the email`, async () => {
    if (!emailDue.length) return expect(!(await dueSection().count()), "Due now shown with nothing due");
    await dueSection().waitFor();
    const names = await dueSection().locator("span.text-sm.font-medium").allTextContents();
    expect(names.length === emailDue.length && emailDue.every((n) => names.includes(n)), `dashboard [${names.join(" | ")}] vs email [${emailDue.join(" | ")}]`);
  });
  await step(`${width}: a trigger chip in Due now copies its command`, async () => {
    if (!emailDue.length) return;
    const chip = dueSection().getByTitle(/^Copy/).first();
    const command = (await chip.textContent()).trim();
    await chip.click();
    await dueSection().getByText("copied ✓").waitFor();
    expect((await page.evaluate(() => navigator.clipboard.readText())) === command, "clipboard doesn't hold the command");
  });
  await step(`${width}: a switched-off loop is never due`, async () => {
    const names = (await dueSection().count()) ? await dueSection().locator("span.text-sm.font-medium").allTextContents() : [];
    expect(!names.includes("Auto-roll playlists"), "a disabled loop is in Due now");
  });
  await step(`${width}: no sideways scroll`, async () => {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw <= width, `page is ${sw}px wide`);
  });
  await step(`${width}: no page errors`, async () => expect(!errors.length, errors.join(" | ")));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
