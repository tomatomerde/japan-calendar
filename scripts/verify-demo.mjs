/**
 * Serves the built demo (demo/_site) and drives it in a real browser.
 *
 * The page makes claims that only a real engine can check, and each one is
 * asserted here rather than assumed:
 *
 *   1. "何も打たなくても結果が見える" — results, including a provisional
 *      badge and a refused input, must be on screen before anyone types.
 *   2. "その後は何を入力してもリクエストは発生しません" — after the bundle
 *      has loaded, no interaction may produce a network request.
 *   3. "日付演算はすべて日本時間に固定" — the page is loaded under several
 *      timezones and the answers are compared. This is the one claim that
 *      cannot be checked by reading the code from a single machine, and a
 *      holiday library that is off by one day is not visibly broken, so it
 *      gets the most attention here.
 *   4. Every figure the page states about coverage matches the library that
 *      the page actually loaded, and the data-source link matches the
 *      provenance baked into that same bundle.
 *
 * Run: npm run test:demo   (after ./demo/build.sh)
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

/** Some sandboxes ship a fixed Chromium rather than a downloaded one. */
function resolveExecutablePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const preinstalled = "/opt/pw-browsers/chromium";
  if (existsSync(preinstalled)) return preinstalled;
  return undefined;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(root, "demo/_site");
const PINNED = (await readFile(path.join(root, "demo/pinned-version.txt"), "utf8")).trim();

if (!existsSync(path.join(SITE, "index.html"))) {
  console.error(`no built demo at ${SITE} — run ./demo/build.sh first`);
  process.exit(1);
}

// The bundle the page will load, imported here so its own metadata can be the
// reference the page is checked against. Anything the page says about the
// data's coverage has to come out of this object.
const bundled = await import(path.join(SITE, "vendor/japan-calendar.js"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    // Resolve under SITE and reject anything that escapes it.
    const file = path.join(SITE, path.normalize(rel));
    if (!file.startsWith(SITE)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const executablePath = resolveExecutablePath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let failure = null;

/** Opens the page in a fresh context and waits for it to report itself ready. */
async function open(timezoneId) {
  const context = await browser.newContext({ timezoneId, locale: "ja-JP" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const loadRequests = [];
  const recordLoad = (r) => loadRequests.push(r.url());
  page.on("request", recordLoad);

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForSelector("body[data-ready='1']", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  page.off("request", recordLoad);

  assert.deepEqual(pageErrors, [], `uncaught page errors during load (${timezoneId})`);
  return { context, page, pageErrors, loadRequests };
}

try {
  const { context, page, pageErrors, loadRequests } = await open("Asia/Tokyo");

  // Whatever the page fetched to boot must be its own origin only. A demo
  // that phones out while claiming otherwise is worse than no demo.
  const foreign = loadRequests.filter((u) => !u.startsWith(`http://127.0.0.1:${port}/`));
  assert.deepEqual(foreign, [], "the page requested a third-party origin during load");

  /* 1. Results are on screen without anyone typing. */
  const verdict = (await page.locator("#holiday-output .verdict-name").first().textContent()).trim();
  assert.equal(verdict, "春分の日", "the default date should resolve to a holiday");

  /* 2. The provisional badge — the distinction the library exists for — is
   *    visible on load, not one interaction away. */
  const badge = await page.locator("#holiday-output .badge-provisional").first().textContent();
  assert.equal(badge.trim(), "暫定", "a provisional holiday must be visible on load");
  assert.ok(
    (await page.locator("#holiday-output .badge-confirmed").count()) > 0,
    "the year list should also contain confirmed holidays, so the two are distinguishable",
  );

  /* 3. A refused input is visible too. This library's whole argument is that
   *    it declines rather than guesses, so a page showing only successes
   *    would misrepresent it. */
  const refusals = await page.locator("#cases-output .case-refuse").count();
  assert.ok(refusals >= 8, `expected the refused-input cases to render, got ${refusals}`);
  const accepted = await page.locator("#cases-output .case-accept").count();
  assert.ok(accepted >= 4, `expected the accepted-input cases to render, got ${accepted}`);

  /* 4. Every case behaved the way the page says it does. `case-unexpected` is
   *    rendered by app.js when a case lands in the other column — i.e. when
   *    the *published library* changed its mind about an input. Nothing else
   *    in this repository would notice that, so this is the assertion that
   *    turns the demo into a check on the release rather than a brochure. */
  assert.equal(
    await page.locator("#cases-output .case-unexpected").count(),
    0,
    "an input case behaved differently from what the page claims — the published library's accepted input may have changed",
  );
  assert.equal(await page.locator("#cases-output .case-alarm").count(), 0, "an input case rendered its alarm text");

  /* 5. Coverage figures come from the bundle, not from the HTML. Assert the
   *    rendered text equals what the loaded library reports, and that no
   *    placeholder was left unfilled. */
  const facts = await page.$$eval("[data-fact]", (nodes) =>
    nodes.map((n) => ({ key: n.dataset.fact, text: n.textContent.trim() })),
  );
  assert.ok(facts.length >= 5, `expected the page to state several facts, got ${facts.length}`);
  const expectedFacts = {
    supported: `${bundled.MIN_SUPPORTED_YEAR}〜${bundled.MAX_SUPPORTED_YEAR}年`,
    "official-range": `${bundled.OFFICIAL_META.firstYear}〜${bundled.OFFICIAL_META.lastYear}年`,
    "equinox-through": `${bundled.OFFICIAL_META.equinoxConfirmedThrough}年`,
    fetched: bundled.OFFICIAL_META.fetchedAt.slice(0, 10),
    sha: bundled.OFFICIAL_META.sha256,
  };
  for (const { key, text } of facts) {
    assert.ok(key in expectedFacts, `the page states an unknown fact: ${key}`);
    assert.equal(text, expectedFacts[key], `the page's "${key}" disagrees with the bundle it loaded`);
    assert.ok(!text.includes("未知の項目"), `the page left "${key}" unfilled`);
  }

  /* 6. The data-source link points where the shipped metadata says the data
   *    came from — and where this repository's own notes say it does. A
   *    hand-typed URL in the page is exactly the kind of fact that rots
   *    silently, so it is compared against two independent records. */
  const sourceHref = await page.getAttribute("#source-link", "href");
  assert.equal(
    sourceHref,
    bundled.OFFICIAL_META.sourceUrl,
    "the data-source link disagrees with the provenance in the bundle",
  );
  const claudeMd = await readFile(path.join(root, "CLAUDE.md"), "utf8");
  assert.ok(
    claudeMd.includes(bundled.OFFICIAL_META.sourceUrl),
    `CLAUDE.md does not name ${bundled.OFFICIAL_META.sourceUrl} as the data source`,
  );

  /* 7. The pinned version is what the page advertises, in both places. */
  assert.equal((await page.locator(".version").textContent()).trim(), `v${PINNED}`);
  assert.ok(
    (await page.locator("body").textContent()).includes(`japan-calendar@${PINNED}`),
    "the install command should name the pinned version",
  );
  assert.equal(
    bundled.OFFICIAL_META.sourceUrl.startsWith("https://"),
    true,
    "the data source should be an https URL",
  );

  /* 8. Zero requests from here on. Start listening only now: the bundle load
   *    above is a request, and it is the one the page tells visitors about. */
  const afterReady = [];
  page.on("request", (r) => afterReady.push(`${r.method()} ${r.url()}`));

  const presets = page.locator(".preset");
  const presetCount = await presets.count();
  assert.ok(presetCount >= 14, `expected the preset buttons to exist, got ${presetCount}`);
  for (let i = 0; i < presetCount; i++) await presets.nth(i).click();

  // Both calendars, and a hand-typed date, because a listener attached to one
  // control would prove nothing about the others.
  for (const value of ["bank", "national"]) {
    await page.locator(`input[name="calendar"][value="${value}"]`).check();
  }
  await page.fill("#holiday-input", "2035-09-23");
  await page.fill("#biz-n", "7");
  await page.fill("#era-year", "12");

  // Give anything asynchronous a chance to fire before declaring silence.
  await page.waitForTimeout(1500);

  assert.deepEqual(afterReady, [], "the page made network requests after loading");
  assert.deepEqual(pageErrors, [], "uncaught page errors during interaction");

  /* 9. The on-page request meter agrees with what the browser actually saw.
   *    Playwright's count is the truth; the meter is what a visitor without
   *    DevTools reads. If the two ever disagree, the page is reassuring people
   *    with a number that means nothing — worse than showing no number. */
  assert.equal(await page.evaluate(() => document.body.dataset.requestsAfterReady), "0");
  assert.equal((await page.locator("#request-count").textContent()).trim(), "0 件");
  assert.equal(
    await page.locator("#request-meter.dirty").count(),
    0,
    "the request meter should not be in its warning state",
  );

  /* 10. Every off-site link opens in a new tab and carries rel=noopener. A
   *     visitor checking the provenance should not lose what they typed. */
  const externals = await page.$$eval("a[href^='http']", (as) =>
    as.map((a) => ({ href: a.href, target: a.target, rel: a.rel })),
  );
  assert.ok(externals.length >= 5, `expected external links, got ${externals.length}`);
  for (const a of externals) {
    assert.equal(a.target, "_blank", `${a.href} should open in a new tab`);
    assert.match(a.rel, /noopener/, `${a.href} should carry rel=noopener`);
  }

  /* 11. Nothing is served with an extension a browser downloads instead of
   *     showing. The attribution notice is only useful if it opens. */
  const localFiles = await page.$$eval("a[href^='./']", (as) => as.map((a) => a.getAttribute("href")));
  for (const href of localFiles) {
    assert.match(href, /\.txt$/, `${href} should be served as .txt so Pages renders it inline`);
  }

  await context.close();

  /* 12. The JST claim, checked from three timezones.
   *
   *     This is the part that cannot be established by running the page once.
   *     The library's contract is that a *calendar date* answers identically
   *     everywhere, while a `Date` is an instant and may legitimately land on
   *     a different day. Both halves are asserted: drop the JST-fixed
   *     arithmetic and the first set diverges; "fix" the demo by feeding
   *     everything through local time and the second set stops diverging.
   */
  const readTimezonePanel = async (timezoneId) => {
    const opened = await open(timezoneId);
    const rows = await opened.page.$$eval(".tz-trap .case", (nodes) =>
      nodes.map((n) => ({
        expr: n.querySelector(".case-expr").textContent.trim(),
        matched: n.querySelector(".case-verdict").classList.contains("case-accept"),
      })),
    );
    const holiday = (await opened.page.locator("#holiday-output .verdict-name").first().textContent()).trim();
    await opened.context.close();
    return { rows, holiday };
  };

  const tokyo = await readTimezonePanel("Asia/Tokyo");
  const chicago = await readTimezonePanel("America/Chicago");
  const kiritimati = await readTimezonePanel("Pacific/Kiritimati");

  const byExpr = (r) => Object.fromEntries(r.rows.map((x) => [x.expr, x.matched]));
  const [t, c, k] = [byExpr(tokyo), byExpr(chicago), byExpr(kiritimati)];

  const CALENDAR_DATE_FORMS = [
    'isHoliday("2028-05-03")',
    "isHoliday({ year: 2028, month: 5, day: 3 })",
    'isHoliday(new Date("2028-05-03"))',
  ];
  for (const expr of CALENDAR_DATE_FORMS) {
    for (const [name, got] of [["Tokyo", t], ["Chicago", c], ["Kiritimati", k]]) {
      assert.equal(got[expr], true, `${expr} should give the same date in ${name} — JST-fixed arithmetic is the point`);
    }
  }

  // The panel earns its place only if it actually shows a shift somewhere.
  // Both of these are real: local midnight moves east of JST, local noon moves
  // west of it, and a page asserting either rule alone would be wrong for half
  // its readers.
  assert.equal(t["isHoliday(new Date(2028, 4, 3))"], true, "local midnight in JST is the same day");
  assert.equal(
    k["isHoliday(new Date(2028, 4, 3))"],
    false,
    "local midnight at UTC+14 should land on a different JST date — the panel has stopped demonstrating the trap",
  );
  assert.equal(
    c["isHoliday(new Date(2028, 4, 3, 12))"],
    false,
    "local noon at UTC-05:00 should land on a different JST date — the panel has stopped demonstrating the trap",
  );

  // The holiday panel's own answer must not move with the timezone.
  assert.equal(tokyo.holiday, chicago.holiday);
  assert.equal(tokyo.holiday, kiritimati.holiday);

  console.log(
    `demo check OK — ${await browser.version()}; ` +
      `${loadRequests.length} request(s) to load the page, 0 after; ` +
      `${accepted} accepted / ${refusals} refused input cases; ` +
      `JST fixed across Asia/Tokyo, America/Chicago, Pacific/Kiritimati`,
  );
} catch (err) {
  failure = err;
} finally {
  await browser.close();
  server.close();
}

if (failure) {
  console.error(failure);
  process.exit(1);
}
