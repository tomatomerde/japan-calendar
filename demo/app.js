/**
 * Demo page logic.
 *
 * Everything here runs against the published bundle in ./vendor/, loaded once
 * on page load. Nothing in this file performs a network request afterwards —
 * scripts/verify-demo.mjs asserts that, because the page tells visitors so.
 *
 * Two rules this file follows throughout:
 *
 *   1. **Nodes are built with textContent, never innerHTML.** Visitor input is
 *      echoed back into the page, and so are library error messages, which
 *      quote the input back verbatim.
 *   2. **Facts about the library are read from the library**, not typed into
 *      the page. The supported year range, the official data's coverage and
 *      its source URL all come out of the loaded bundle, so the page cannot
 *      drift away from what the published package actually does. The one
 *      exception is the version string, which the build stamps in from
 *      demo/pinned-version.txt and scripts/verify-demo.mjs cross-checks.
 */

/* ---------- small DOM helpers ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * Reads a number field without inventing a value for an empty one.
 *
 * `Number("")` is `0`, so clearing the business-day field used to produce a
 * confident "+0 営業日" — a valid-looking answer to a question nobody asked.
 * That is precisely the failure mode this library refuses to have, and having
 * the demo commit it in front of the copy explaining why it is wrong would be
 * worse than a blank result. NaN reaches the library and comes back as
 * InvalidArgumentError, which is the honest outcome and the one the page is
 * arguing for.
 */
function numberFieldValue(input) {
  return input.value.trim() === "" ? Number.NaN : Number(input.value);
}

/** `{year,month,day}` -> `2028-03-20（月）`. */
function formatDateJa(lib, date) {
  return `${lib.toIsoDate(date)}（${WEEKDAY_JA[lib.weekdayOf(date)]}）`;
}

/**
 * Renders a thrown value for display.
 *
 * The library's errors all carry a `name` that survives minification (that is
 * deliberate on its side), and the name is the part a reader can act on, so it
 * is shown as its own chip rather than buried in the sentence.
 */
function errorParts(err) {
  if (err && typeof err.name === "string" && typeof err.message === "string") {
    return { name: err.name, message: err.message };
  }
  return { name: "Error", message: String(err) };
}

function errorBox(err, lead) {
  const box = el("div", "warn");
  const { name, message } = errorParts(err);
  const head = el("p", "warn-head");
  head.append(el("code", "err-name", name));
  head.append(el("span", "err-lead", lead));
  box.append(head);
  box.append(el("p", "err-message", message));
  return box;
}

/**
 * The confirmed/provisional badge.
 *
 * This distinction is the reason the library exists in the form it does, so it
 * gets a visual weight the rest of the result does not: a provisional date is
 * a forecast, and a page that renders it identically to a legally fixed one
 * has thrown away the only thing that makes the answer honest.
 */
function confirmedBadge(lib, holiday) {
  const provisional = !holiday.confirmed;
  const badge = el("span", provisional ? "badge badge-provisional" : "badge badge-confirmed");
  badge.textContent = provisional ? "暫定" : "確定";
  // Named for what it actually measures. `equinoxConfirmedThrough` is the last
  // year whose equinox dates have been gazetted, which is not the same quantity
  // as `lastYear` (the official CSV's final row) even though the two happen to
  // be equal right now — so calling this range "公式データ" would be a label
  // that stops being true the first time they diverge.
  badge.title = provisional
    ? `confirmed: false — 春分・秋分が確定しているのは ${lib.OFFICIAL_META.equinoxConfirmedThrough} 年までで、その先は計算による予測値です`
    : "confirmed: true — 内閣府の公式データと突き合わせ済み";
  return badge;
}

const CATEGORY_JA = {
  statutory: "法定の祝日",
  substitute: "振替休日",
  bridge: "国民の休日（祝日に挟まれた日）",
};

/* ---------- panel 1: holidays ---------- */

const PRESET_HOLIDAYS = [
  {
    label: "2028-03-20 春分の日",
    value: "2028-03-20",
    note: "公式データの外。「暫定」バッジが付くのを見る",
  },
  {
    label: "2029-09-24 振替休日",
    value: "2029-09-24",
    note: "元の秋分の日が暫定なので、振替休日まで暫定になる",
  },
  {
    label: "2032-09-21 国民の休日",
    value: "2032-09-21",
    note: "祝日に挟まれた日が祝日になる。前後どちらかが暫定なら暫定",
  },
  {
    label: "2028-05-03 憲法記念日",
    value: "2028-05-03",
    note: "日付が法律で決まっている祝日は、何年先でも「確定」",
  },
  {
    label: "2100-01-01 範囲外",
    value: "2100-01-01",
    note: "黙って「祝日でない」と答えず、範囲外だと言って失敗する",
  },
];

function renderHoliday(lib, isoValue, out) {
  out.replaceChildren();

  let holiday;
  let date;
  try {
    date = lib.toCivilDate(isoValue);
    holiday = lib.isHoliday(isoValue);
  } catch (err) {
    out.append(
      errorBox(
        err,
        "この日付は受け付けられませんでした（推測で答えを返すより、失敗を返す設計です）",
      ),
    );
    return;
  }

  const head = el("div", "verdict" + (holiday === null ? " verdict-plain" : " verdict-holiday"));
  head.append(el("span", "verdict-date", formatDateJa(lib, date)));
  if (holiday === null) {
    head.append(el("span", "verdict-name", "祝日ではありません"));
  } else {
    head.append(el("span", "verdict-name", holiday.name));
    head.append(confirmedBadge(lib, holiday));
  }
  out.append(head);

  if (holiday !== null) {
    const meta = el("dl", "kv-list");
    for (const [k, v] of [
      ["name", holiday.name],
      ["category", `${holiday.category} — ${CATEGORY_JA[holiday.category] ?? holiday.category}`],
      [
        "confirmed",
        holiday.confirmed
          ? "true — 内閣府の公式データと突き合わせて一致している"
          : "false — 公式データの範囲外。国立天文台の暦要項が官報に載るまで法的に確定しない",
      ],
    ]) {
      meta.append(el("dt", "kv-key", k));
      meta.append(el("dd", "kv-value", v));
    }
    out.append(meta);
  }

  // The business-day answer for the same date, because "is it a holiday" and
  // "can I settle a payment" are different questions and this library answers
  // both. Weekends are the gap: 2028-01-01 is a holiday *and* a Saturday.
  const biz = el("p", "aside");
  biz.append(el("span", "kv-key", "isBusinessDay"));
  biz.append(
    el(
      "span",
      "kv-value",
      `national: ${lib.isBusinessDay(isoValue, "national")} / bank: ${lib.isBusinessDay(isoValue, "bank")}`,
    ),
  );
  out.append(biz);

  const year = date.year;
  const list = lib.holidaysForYear(year);
  const provisional = list.filter((h) => !h.confirmed).length;

  const summary = el("p", "summary");
  summary.textContent =
    `${year}年の祝日は ${list.length} 件` +
    (provisional > 0 ? `（うち ${provisional} 件が暫定）` : "（すべて確定）");
  out.append(summary);

  const table = el("ul", "holiday-list");
  for (const h of list) {
    const li = el("li", lib.isSameCivil(h.date, date) ? "hit" : undefined);
    li.append(el("span", "hl-date", formatDateJa(lib, h.date)));
    li.append(el("span", "hl-name", h.name));
    li.append(el("span", "hl-cat", h.category));
    li.append(confirmedBadge(lib, h));
    table.append(li);
  }
  out.append(table);
}

/* ---------- panel 2: business days ---------- */

const PRESET_BUSINESS = [
  {
    label: "年末年始 2026-12-30 +1",
    value: { from: "2026-12-30", n: 1 },
    note: "bank は 12/31〜1/3 を飛ばして 1/4。national は 12/31 が営業日",
  },
  {
    label: "ゴールデンウィーク 2028-05-01 +3",
    value: { from: "2028-05-01", n: 3 },
    note: "憲法記念日・みどりの日・こどもの日と、続く土日をまとめて飛ばす",
  },
  {
    label: "暫定の祝日をまたぐ 2029-09-21 +2",
    value: { from: "2029-09-21", n: 2 },
    note: "秋分の日と、その振替休日（どちらも暫定）を飛ばす",
  },
  {
    label: "さかのぼる 2028-05-08 −3",
    value: { from: "2028-05-08", n: -3 },
    note: "負の数で過去方向。ゴールデンウィークの祝日と土日を遡って飛ばす",
  },
  {
    label: "範囲の外へ出る 2099-12-30 +3",
    value: { from: "2099-12-30", n: 3 },
    note: "計算の途中で 2100 年に出る。それらしい日付を返さず失敗する",
  },
];

function renderBusiness(lib, from, n, calendar, out) {
  out.replaceChildren();

  let result;
  try {
    result = lib.addBusinessDays(from, n, calendar);
  } catch (err) {
    out.append(errorBox(err, "この計算はできませんでした"));
    return;
  }

  const fromDate = lib.toCivilDate(from);
  const head = el("div", "verdict verdict-holiday");
  head.append(el("span", "verdict-date", formatDateJa(lib, fromDate)));
  head.append(el("span", "verdict-arrow", n >= 0 ? `＋${n} 営業日` : `−${Math.abs(n)} 営業日`));
  head.append(el("span", "verdict-name", formatDateJa(lib, result)));
  out.append(head);

  // Show the days that were skipped and why: the answer alone is not
  // checkable, and this library's argument is that its answer *is* checkable.
  //
  // The **open** interval, not the closed one. addBusinessDays never evaluates
  // the start date — it steps first, then tests — so a non-business 起点 was
  // never "skipped" by the calculation, and the far end is a business day by
  // construction. Counting the endpoints made 2028-05-03 (a holiday) +1 report
  // five skipped days instead of four, and n=0 report one skipped day for a
  // calculation that moved nowhere. Both numbers were wrong in the direction
  // that makes the page look like it is checking its own answer when it is not.
  const lo = Math.min(lib.toDays(fromDate), lib.toDays(result));
  const hi = Math.max(lib.toDays(fromDate), lib.toDays(result));
  const skipped = [];
  for (let d = lo + 1; d < hi; d += 1) {
    const c = lib.civilFromDays(d);
    if (lib.isBusinessDay(c, calendar)) continue;
    const h = lib.isHoliday(c);
    let why;
    if (h !== null) why = h.name;
    else if (lib.isWeekend(c)) why = WEEKDAY_JA[lib.weekdayOf(c)] === "土" ? "土曜" : "日曜";
    else why = calendar === "bank" ? "銀行の年末年始休業（12/31〜1/3）" : "非営業日";
    skipped.push({ date: c, why, holiday: h });
  }

  const summary = el("p", "summary");
  summary.textContent =
    skipped.length === 0
      ? "この区間に非営業日はありません。"
      : `この区間で飛ばした非営業日: ${skipped.length} 日`;
  out.append(summary);

  if (skipped.length > 0) {
    // Capped, and the cap is stated. Nothing stops a visitor typing 30000 into
    // the field: the library answers it fine (that is its job), but listing
    // every skipped day put 14,000 rows in the DOM and froze the page for over
    // a second. Truncating silently would be worse than the freeze — the list
    // is offered as the way to check the answer, so a short list that looks
    // complete would be the page quietly lying about its own evidence.
    const LIMIT = 60;
    const list = el("ul", "holiday-list");
    for (const s of skipped.slice(0, LIMIT)) {
      const li = el("li");
      li.append(el("span", "hl-date", formatDateJa(lib, s.date)));
      li.append(el("span", "hl-name", s.why));
      if (s.holiday !== null) li.append(confirmedBadge(lib, s.holiday));
      list.append(li);
    }
    out.append(list);

    if (skipped.length > LIMIT) {
      out.append(
        el(
          "p",
          "summary",
          `↑ 先頭 ${LIMIT} 日だけを表示しています（全 ${skipped.length} 日）。` +
            `残りは省略しました——このページが重くなるためで、計算自体はすべての日を見ています。`,
        ),
      );
    }
  }

  const between = el("p", "aside");
  between.append(el("span", "kv-key", "businessDaysBetween"));
  const spanned = lib.businessDaysBetween(fromDate, result, calendar);
  between.append(
    el(
      "span",
      "kv-value",
      `${lib.toIsoDate(fromDate)} → ${lib.toIsoDate(result)} は ` +
        `${spanned} 営業日（終端を含まない半開区間）`,
    ),
  );
  // These two numbers disagree when the start date is not itself a business
  // day, and the disagreement looks like a contradiction sitting right under
  // the headline answer: 2028-05-03 (憲法記念日) +1 lands on 5/8, while the
  // interval [5/3, 5/8) holds zero business days. Both are right — the interval
  // counts the start, addBusinessDays steps past it — but "終端を含まない" only
  // explains the far end, so the near end gets said out loud when it bites.
  if (spanned !== Math.abs(n)) {
    between.append(
      el(
        "span",
        "kv-note",
        `起点の ${lib.toIsoDate(fromDate)} 自体が非営業日なので、この数は上の ` +
          `${Math.abs(n)} と一致しません。半開区間は起点を数に入れ、addBusinessDays は ` +
          `起点の翌日から数え始めます`,
      ),
    );
  }
  out.append(between);

  // Both calendars, always. The difference between them is the whole reason
  // the option exists, and a preset that only fills in the dates cannot show
  // it — the visitor would have to know to flip the radio, having not yet been
  // given a reason to care.
  const compare = el("div", "compare");
  compare.append(el("h3", "case-group", "national と bank の差"));
  const rows = el("ul", "cases");
  const answers = {};
  for (const kind of ["national", "bank"]) {
    const li = el("li", "case");
    li.append(el("code", "case-expr", `addBusinessDays("${lib.toIsoDate(fromDate)}", ${n}, "${kind}")`));
    let text;
    try {
      const value = lib.addBusinessDays(fromDate, n, kind);
      answers[kind] = value;
      text = lib.toIsoDate(value);
    } catch (err) {
      const { name, message } = errorParts(err);
      text = `${name}: ${message}`;
    }
    li.append(el("span", `case-verdict ${kind === calendar ? "case-accept" : "case-refuse"}`, kind === calendar ? "選択中" : "参考"));
    li.append(el("span", "case-result", text));
    rows.append(li);
  }
  compare.append(rows);

  // Measured for the dates actually on screen, not a remembered worst case. A
  // sentence saying "3営業日ずれます" sat directly above a preset whose own gap
  // is one day — the kind of stale figure this page exists to argue against.
  let gapText = "この起点では、どちらのカレンダーでも同じ答えになります。";
  if (answers.national !== undefined && answers.bank !== undefined) {
    const gap = Math.abs(lib.toDays(answers.bank) - lib.toDays(answers.national));
    if (gap > 0) {
      gapText =
        `この起点では暦日で ${gap} 日ずれます（${lib.toIsoDate(answers.national)} と ` +
        `${lib.toIsoDate(answers.bank)}）。支払日を扱うなら、どちらのカレンダーで` +
        `数えているかを決めておく必要があります。`;
    }
  }
  compare.append(
    el(
      "p",
      "panel-lead",
      "同じ結果になる期間のほうが多く、差が出るのは年末年始をまたぐときだけです。" + gapText,
    ),
  );
  out.append(compare);
}

/* ---------- panel 3: wareki ---------- */

const PRESET_WAREKI = [
  {
    label: "改元当日 2019-05-01",
    value: { iso: "2019-05-01", era: "令和", eraYear: 1, month: 5, day: 1 },
    note: "令和元年5月1日。元年は「1年」ではなく「元年」と書く",
  },
  {
    label: "その前日 2019-04-30",
    value: { iso: "2019-04-30", era: "平成", eraYear: 31, month: 4, day: 30 },
    note: "平成31年4月30日。改元は日単位で切り替わる",
  },
  {
    label: "平成31年5月1日（存在しない）",
    value: { iso: "2019-05-01", era: "平成", eraYear: 31, month: 5, day: 1 },
    note: "改元済みなので存在しない。どの和暦に当たるかまで教える",
  },
  {
    label: "昭和64年1月8日（存在しない）",
    value: { iso: "1989-01-08", era: "昭和", eraYear: 64, month: 1, day: 8 },
    note: "昭和は1月7日まで。翌日は平成元年1月8日（月日は繰り越す）",
  },
  {
    label: "明治5年12月3日（消えた日）",
    value: { iso: "1873-01-01", era: "明治", eraYear: 5, month: 12, day: 3 },
    note: "1873年の改暦で消えた29日間。「範囲外」とは別のエラーで返す",
  },
  {
    label: "明治6年1月1日（範囲の下端）",
    value: { iso: "1873-01-01", era: "明治", eraYear: 6, month: 1, day: 1 },
    note: "改暦の翌日。ここより前は太陰太陽暦なので、そもそも変換の対象外",
  },
  {
    label: "2028-03-20 春分の日",
    value: { iso: "2028-03-20", era: "令和", eraYear: 10, month: 3, day: 20 },
    note: "令和10年3月20日。和暦から引いても「暫定」が付いてくる",
  },
];

function renderToWareki(lib, isoValue, out) {
  out.replaceChildren();

  let wareki;
  let date;
  try {
    date = lib.toCivilDate(isoValue);
    wareki = lib.toWareki(isoValue);
  } catch (err) {
    out.append(errorBox(err, "この日付は和暦に変換できませんでした"));
    return;
  }

  const head = el("div", "verdict verdict-holiday");
  head.append(el("span", "verdict-date", lib.toIsoDate(date)));
  head.append(el("span", "verdict-arrow", "→"));
  head.append(el("span", "verdict-name", lib.formatWareki(wareki, "ja")));
  out.append(head);

  const meta = el("dl", "kv-list");
  for (const [k, v] of [
    ["ja", lib.formatWareki(wareki, "ja")],
    ["ja-numeric", lib.formatWareki(wareki, "ja-numeric")],
    ["abbr", lib.formatWareki(wareki, "abbr")],
    ["abbr-padded", lib.formatWareki(wareki, "abbr-padded")],
    ["eraRomaji", wareki.eraRomaji],
    ["isGannen", String(wareki.isGannen)],
  ]) {
    meta.append(el("dt", "kv-key", k));
    meta.append(el("dd", "kv-value", v));
  }
  out.append(meta);
}

function renderFromWareki(lib, era, eraYear, month, day, out) {
  out.replaceChildren();

  let date;
  try {
    date = lib.fromWareki(era, eraYear, month, day);
  } catch (err) {
    out.append(
      errorBox(err, "この和暦の日付は西暦に変換できませんでした（存在しない日付です）"),
    );
    return;
  }

  const head = el("div", "verdict verdict-holiday");
  // The input echoed back as typed — numerals, not 元年. Rendering the
  // canonical form here would mean re-implementing formatWareki's rules in the
  // page, and the page would then be the thing deciding how a wareki date is
  // written. The canonical form comes from the library, below.
  head.append(el("span", "verdict-date", `${era}${eraYear}年${month}月${day}日`));
  head.append(el("span", "verdict-arrow", "→"));
  head.append(el("span", "verdict-name", formatDateJa(lib, date)));
  out.append(head);

  const canonical = lib.formatWareki(lib.toWareki(date), "ja");
  const canon = el("p", "aside");
  canon.append(el("span", "kv-key", "formatWareki"));
  canon.append(el("span", "kv-value", canonical));
  canon.append(
    el(
      "span",
      "kv-note",
      canonical === `${era}${eraYear}年${month}月${day}日`
        ? "入力どおりの書き方です"
        : "ライブラリが正規の書き方に直したもの（元年は「1年」と書きません）",
    ),
  );
  out.append(canon);

  // The two APIs do not cover the same span, and the gap is 76 years wide:
  // wareki conversion starts at Meiji 6-1-1 (1873), the holiday API at 1949.
  // Feeding a valid wareki result straight into isHoliday therefore throws for
  // any date before 1949 — which the 明治6年1月1日 preset does on the first
  // click. Saying so is more useful than hiding the row, since the mismatch is
  // a real property of the library that a caller has to handle too.
  const aside = el("p", "aside");
  aside.append(el("span", "kv-key", "isHoliday"));
  try {
    const holiday = lib.isHoliday(date);
    aside.append(el("span", "kv-value", holiday === null ? "祝日ではありません" : holiday.name));
    if (holiday !== null) aside.append(confirmedBadge(lib, holiday));
  } catch (err) {
    const { name } = errorParts(err);
    aside.append(el("span", "kv-value", `${name} — 祝日 API の対応範囲外`));
    aside.append(
      el(
        "span",
        "kv-note",
        `和暦変換は明治6年1月1日から、祝日判定は ${lib.MIN_SUPPORTED_YEAR} 年からで、` +
          `対応範囲が違います`,
      ),
    );
  }
  out.append(aside);
}

/* ---------- panel 4: what the library accepts ---------- */

/**
 * The input cases.
 *
 * This panel is the reason the demo exists in this shape. A holiday library
 * that misreads a date does not throw — it answers a different day, confidently
 * and silently, and an off-by-one propagates straight into a business-day
 * calculation. So every shape a caller is likely to have on hand is run here in
 * front of the visitor, and the two outcomes are shown as equally valid:
 * accepted, or refused with a reason. What must never appear is a third
 * outcome — accepted, and quietly wrong.
 *
 * `expect` records which of the two this project intends, so
 * scripts/verify-demo.mjs can fail the build if a release ever moves a case
 * from one column to the other without anyone noticing.
 */
const INPUT_CASES = [
  {
    group: "受け付ける形",
    cases: [
      {
        expr: `isHoliday("2028-03-20")`,
        expect: "accept",
        note: "YYYY-MM-DD。タイムゾーンの概念を持たない暦の日付として、そのまま読む",
        run: (lib) => lib.isHoliday("2028-03-20"),
      },
      {
        expr: `isHoliday({ year: 2028, month: 3, day: 20 })`,
        expect: "accept",
        note: "オブジェクト。これもタイムゾーンは関係しない",
        run: (lib) => lib.isHoliday({ year: 2028, month: 3, day: 20 }),
      },
      {
        expr: `isHoliday("2028-03-20T00:00:00Z")`,
        expect: "accept",
        note: "オフセット付きの日時は「瞬間」。日本時間に直してから日付にする",
        run: (lib) => lib.isHoliday("2028-03-20T00:00:00Z"),
      },
      {
        expr: `isHoliday(new Date("2028-03-20T15:00:00Z"))`,
        expect: "accept",
        note: "Date も「瞬間」。UTC 15:00 は日本時間だと翌日の 0:00 なので 3/21 になる",
        run: (lib) => lib.isHoliday(new Date("2028-03-20T15:00:00Z")),
      },
    ],
  },
  {
    group: "受け付けない形（黙って解釈しない）",
    cases: [
      {
        expr: `isHoliday("2028/3/20")`,
        expect: "refuse",
        note: "スラッシュ区切りは受けない。月日の順序が国によって逆になるため",
        run: (lib) => lib.isHoliday("2028/3/20"),
      },
      {
        expr: `isHoliday("2028年3月20日")`,
        expect: "refuse",
        note: "和文表記も受けない。受けるなら表記ゆれを全部決め切る必要がある",
        run: (lib) => lib.isHoliday("2028年3月20日"),
      },
      {
        expr: `isHoliday("2028-3-20")`,
        expect: "refuse",
        note: "0 埋めなし。1文字違いを黙って直すと、直せない入力との境界が消える",
        run: (lib) => lib.isHoliday("2028-3-20"),
      },
      {
        expr: `isHoliday("20280320")`,
        expect: "refuse",
        note: "区切りなし8桁。日付にも数値にも読めてしまう",
        run: (lib) => lib.isHoliday("20280320"),
      },
      {
        expr: `isHoliday(1836057600000)`,
        expect: "refuse",
        note: "UNIX 時刻の数値。秒とミリ秒を取り違えると 1970 年付近を指すので受けない",
        run: (lib) => lib.isHoliday(1836057600000),
      },
      {
        expr: `isHoliday("2028-03-20T00:00:00")`,
        expect: "refuse",
        note: "オフセットの無い日時。ここが本題（下のタイムゾーンの節を見てください）",
        run: (lib) => lib.isHoliday("2028-03-20T00:00:00"),
      },
      {
        expr: `isHoliday("2027-02-29")`,
        expect: "refuse",
        note: "存在しない日。2027 年は閏年ではない",
        run: (lib) => lib.isHoliday("2027-02-29"),
      },
      {
        expr: `isHoliday({ y: 2028, m: 3, d: 20 })`,
        expect: "refuse",
        note: "似て非なる形。何が足りないかまで書いて失敗する",
        run: (lib) => lib.isHoliday({ y: 2028, m: 3, d: 20 }),
      },
      {
        expr: `isBusinessDay("2028-03-20", "Bank")`,
        expect: "refuse",
        note: "大文字違い。以前は黙って national にフォールバックして違う答えを返していた",
        run: (lib) => lib.isBusinessDay("2028-03-20", "Bank"),
      },
      {
        expr: `addBusinessDays("2028-03-20", 1.5)`,
        expect: "refuse",
        note: "小数の営業日。以前は 2 日進んでいた",
        run: (lib) => lib.addBusinessDays("2028-03-20", 1.5),
      },
    ],
  },
];

function renderInputCases(lib, out) {
  out.replaceChildren();

  for (const section of INPUT_CASES) {
    out.append(el("h3", "case-group", section.group));
    const list = el("ul", "cases");
    for (const c of section.cases) {
      const li = el("li", "case");
      li.append(el("code", "case-expr", c.expr));

      let outcome;
      let rendered;
      try {
        const value = c.run(lib);
        outcome = "accept";
        rendered = value === null ? "null（祝日ではない）" : JSON.stringify(value);
      } catch (err) {
        outcome = "refuse";
        const { name, message } = errorParts(err);
        rendered = `${name}: ${message}`;
      }

      const asExpected = outcome === c.expect;
      const verdict = el(
        "span",
        `case-verdict case-${outcome}` + (asExpected ? "" : " case-unexpected"),
      );
      verdict.textContent = outcome === "accept" ? "受け付けた" : "受け付けず、理由を返した";
      li.append(verdict);
      li.append(el("span", "case-result", rendered));
      li.append(el("span", "case-note", c.note));

      // Should never render. If it does, the published library changed its
      // mind about an input and this page is the thing that noticed.
      if (!asExpected) {
        li.append(
          el(
            "span",
            "case-alarm",
            `想定と違います（このページは "${c.expect}" を期待していました）。ライブラリ側の変更が疑われます。`,
          ),
        );
      }
      list.append(li);
    }
    out.append(list);
  }
}

/**
 * The timezone section.
 *
 * A holiday library that is off by one day does not look broken; it looks like
 * a holiday moved. The failure is silent, it depends on where the caller
 * happens to be, and it multiplies once a business-day calculation is layered
 * on top. So rather than assert "all arithmetic is fixed to JST", the page
 * runs the comparison in the visitor's own browser, in their own timezone, and
 * shows both answers side by side.
 */
function renderTimezone(lib, out) {
  out.replaceChildren();

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "(不明)";
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "−";
  const abs = Math.abs(offsetMinutes);
  const offsetText = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;

  const env = el("p", "tz-env");
  env.append(el("span", "kv-key", "このブラウザ"));
  env.append(el("span", "kv-value", `${tz}（${offsetText}）`));
  out.append(env);

  const now = new Date();
  const jstToday = lib.toCivilDate(now);
  // Deliberately built from the host's local components — this is the shape a
  // date picker or `new Date(y, m, d)` hands you, and the one that moves.
  const localToday = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };

  const rows = [
    {
      expr: `toCivilDate(new Date())`,
      value: lib.toIsoDate(jstToday),
      note: "日本時間の「今日」。このライブラリの答えはここに固定されています",
    },
    {
      expr: `new Date().getFullYear() など`,
      value: lib.toIsoDate(localToday),
      note: "あなたの環境の「今日」。ライブラリはこちらを使いません",
    },
  ];

  const same = lib.isSameCivil(jstToday, localToday);
  const list = el("ul", "tz-rows");
  for (const r of rows) {
    const li = el("li");
    li.append(el("code", "case-expr", r.expr));
    li.append(el("span", "tz-value", r.value));
    li.append(el("span", "case-note", r.note));
    list.append(li);
  }
  out.append(list);

  const verdict = el("p", same ? "tz-verdict tz-same" : "tz-verdict tz-diff");
  verdict.textContent = same
    ? "いまこの瞬間は、日本時間の日付とあなたの環境の日付が同じです。時差のある地域から見ると、ここがずれます。"
    : "いまこの瞬間、日本時間とあなたの環境で日付が違います。ライブラリは日本時間のほうを答えます。";
  out.append(verdict);

  // The concrete trap, run live.
  //
  // Which of these actually shifts is *not* a fact worth asserting in prose —
  // it depends on the visitor's UTC offset and on what time of day the Date
  // was built from, and the obvious summary ("west of Japan you get the day
  // before") is simply wrong: from UTC-05:00, local midnight lands at 14:00
  // JST on the same date, while local *noon* lands at 02:00 JST the next day.
  // A page that stated either rule would be telling half its readers something
  // their own browser contradicts. So each row is compared against the date it
  // was meant to express, and the badge reports what happened here.
  const INTENDED = { year: 2028, month: 5, day: 3 };
  const intendedIso = lib.toIsoDate(INTENDED);

  const trap = el("div", "tz-trap");
  trap.append(el("h3", "case-group", `どの書き方が ${intendedIso} を指し続けるか`));
  trap.append(
    el(
      "p",
      "panel-lead",
      "どれも「2028年5月3日（憲法記念日）」を表そうとした書き方です。" +
        "実行した結果その日付になったかどうかを、いまこのブラウザで判定しています。",
    ),
  );

  const trapRows = [
    {
      expr: `isHoliday("2028-05-03")`,
      run: () => lib.isHoliday("2028-05-03"),
      note: "文字列。暦の日付なので、実行環境に関係なく 5/3",
    },
    {
      expr: `isHoliday({ year: 2028, month: 5, day: 3 })`,
      run: () => lib.isHoliday({ year: 2028, month: 5, day: 3 }),
      note: "オブジェクト。これも実行環境に関係ありません",
    },
    {
      expr: `isHoliday(new Date(2028, 4, 3))`,
      run: () => lib.isHoliday(new Date(2028, 4, 3)),
      note:
        "ローカル時刻の 0 時から作った「瞬間」。日本時間に直した結果が 5/3 かどうかは、" +
        "この環境の UTC オフセット次第です",
    },
    {
      expr: `isHoliday(new Date(2028, 4, 3, 12))`,
      run: () => lib.isHoliday(new Date(2028, 4, 3, 12)),
      note:
        "同じ日のローカル正午。0 時とは別の瞬間なので、0 時ではずれない環境でも" +
        "こちらではずれることがあります",
    },
    {
      expr: `isHoliday(new Date("2028-05-03"))`,
      run: () => lib.isHoliday(new Date("2028-05-03")),
      note:
        "文字列から作った Date は UTC の 0 時＝日本時間の同日 9 時。" +
        "実行環境に関係なく 5/3 になりますが、それは Date の解釈規則の副産物です",
    },
  ];

  const trapList = el("ul", "cases");
  for (const r of trapRows) {
    const li = el("li", "case");
    li.append(el("code", "case-expr", r.expr));

    let text;
    let matched;
    try {
      const v = r.run();
      matched = v !== null && lib.toIsoDate(v.date) === intendedIso;
      text = v === null ? "null（祝日ではない）" : `${v.name}（${lib.toIsoDate(v.date)}）`;
    } catch (err) {
      matched = false;
      const { name, message } = errorParts(err);
      text = `${name}: ${message}`;
    }

    li.append(
      el(
        "span",
        matched ? "case-verdict case-accept" : "case-verdict case-depends",
        matched ? `${intendedIso} になった` : `${intendedIso} にならなかった`,
      ),
    );
    li.append(el("span", "case-result", text));
    li.append(el("span", "case-note", r.note));
    trapList.append(li);
  }
  trap.append(trapList);

  trap.append(
    el(
      "p",
      "panel-lead",
      "ここで押さえてほしいのは「Date を渡すな」ではありません——" +
        "Date は瞬間であって暦の日付ではない、ということです。" +
        "手元にあるのが暦の日付（利用者が選んだ日、伝票に書かれた日）なら、" +
        "文字列かオブジェクトで渡せば、どこで実行しても同じ日になります。",
    ),
  );
  out.append(trap);
}

/* ---------- facts read out of the library ---------- */

/**
 * Fills in the numbers the page states about coverage.
 *
 * Typed into the HTML they would be four more figures to keep in sync with a
 * data update; read from the bundle they cannot be wrong. The official data's
 * range in particular moves every time the Cabinet Office publishes.
 */
function renderFacts(lib) {
  const meta = lib.OFFICIAL_META;
  // Keyed by data-fact rather than by id, because several of these figures are
  // stated in more than one place on the page. Two elements cannot share an id,
  // and a second copy that the fill-in step misses is exactly the stale number
  // this function exists to prevent.
  const values = {
    supported: `${lib.MIN_SUPPORTED_YEAR}〜${lib.MAX_SUPPORTED_YEAR}年`,
    "official-range": `${meta.firstYear}〜${meta.lastYear}年`,
    "equinox-through": `${meta.equinoxConfirmedThrough}年`,
    fetched: meta.fetchedAt.slice(0, 10),
    sha: meta.sha256,
  };
  for (const node of document.querySelectorAll("[data-fact]")) {
    const value = values[node.dataset.fact];
    // Left visibly unfilled rather than silently blank: an unknown key means
    // the page asked for a figure this function does not know how to produce.
    node.textContent = value ?? `（未知の項目: ${node.dataset.fact}）`;
  }

  // The source link is the page's one externally checkable claim about where
  // the data came from, so it is taken from the shipped metadata rather than
  // typed into the HTML. scripts/verify-demo.mjs asserts the two agree.
  const link = document.getElementById("source-link");
  if (link) {
    link.href = meta.sourceUrl;
    link.textContent = meta.sourceUrl;
  }
}

/* ---------- wiring ---------- */

function makePresets(container, presets, apply) {
  for (const preset of presets) {
    const button = el("button", "preset");
    button.type = "button";
    button.append(el("span", "preset-label", preset.label));
    if (preset.note) button.append(el("span", "preset-note", preset.note));
    button.addEventListener("click", () => apply(preset.value));
    container.append(button);
  }
}

/**
 * Counts the page's own network activity after the bundle has loaded and shows
 * the running total.
 *
 * The page already told visitors to open DevTools, which is the trustworthy
 * check but not one every reader knows how to run. This puts the same number
 * on the page so the claim is legible without tools — and the copy next to it
 * says outright that a page counting itself is not proof, so the DevTools
 * route stays the answer for anyone who wants one.
 *
 * PerformanceObserver sees fetch/XHR/img/script/css alike, which is wider than
 * patching fetch would be: anything that costs a request shows up here.
 *
 * Entries are filtered by startTime rather than by arrival. A resource whose
 * request began during page load can have its timing entry delivered after the
 * page goes live — the browser's own /favicon.ico does exactly that — and
 * counting it would show every visitor "1 件" for something they did not cause.
 * A meter that cries wolf on load is worse than no meter, because the number
 * it shows during a real leak would look the same.
 */
function startRequestMeter() {
  const output = document.getElementById("request-count");
  if (!output || typeof PerformanceObserver === "undefined") return;

  const startedAt = performance.now();
  let count = 0;
  const observer = new PerformanceObserver((list) => {
    count += list.getEntries().filter((e) => e.startTime >= startedAt).length;
    if (count === 0) return;
    output.textContent = `${count} 件`;
    // Only ever flips on. A page that has made a request has made it.
    document.getElementById("request-meter")?.classList.add("dirty");
    // Read by scripts/verify-demo.mjs, which asserts this stays at 0.
    document.body.dataset.requestsAfterReady = String(count);
  });
  observer.observe({ type: "resource", buffered: false });
  document.body.dataset.requestsAfterReady = "0";
}

async function main() {
  const loading = document.getElementById("loading");
  const loadError = document.getElementById("load-error");

  let lib;
  try {
    lib = await import("./vendor/japan-calendar.js");
  } catch (err) {
    loading.hidden = true;
    loadError.hidden = false;
    loadError.textContent = `ライブラリの読み込みに失敗しました: ${err.message}`;
    return;
  }

  renderFacts(lib);

  /* panel 1 */
  const holidayInput = document.getElementById("holiday-input");
  const holidayOutput = document.getElementById("holiday-output");
  const runHoliday = () => renderHoliday(lib, holidayInput.value, holidayOutput);
  makePresets(document.getElementById("holiday-presets"), PRESET_HOLIDAYS, (v) => {
    holidayInput.value = v;
    runHoliday();
  });
  holidayInput.addEventListener("input", runHoliday);
  holidayInput.addEventListener("change", runHoliday);

  /* panel 2 */
  const bizFrom = document.getElementById("biz-from");
  const bizN = document.getElementById("biz-n");
  const bizOutput = document.getElementById("biz-output");
  const bizCalendar = () => document.querySelector('input[name="calendar"]:checked').value;
  const runBiz = () =>
    renderBusiness(lib, bizFrom.value, numberFieldValue(bizN), bizCalendar(), bizOutput);
  makePresets(document.getElementById("biz-presets"), PRESET_BUSINESS, (v) => {
    bizFrom.value = v.from;
    bizN.value = String(v.n);
    runBiz();
  });
  for (const node of [bizFrom, bizN]) {
    node.addEventListener("input", runBiz);
    node.addEventListener("change", runBiz);
  }
  for (const radio of document.querySelectorAll('input[name="calendar"]')) {
    radio.addEventListener("change", runBiz);
  }

  /* panel 3 */
  const warekiIso = document.getElementById("wareki-iso");
  const warekiIsoOutput = document.getElementById("wareki-iso-output");
  const eraSelect = document.getElementById("era-select");
  const eraYear = document.getElementById("era-year");
  const eraMonth = document.getElementById("era-month");
  const eraDay = document.getElementById("era-day");
  const warekiBackOutput = document.getElementById("wareki-back-output");

  for (const era of lib.ERAS) {
    const option = el("option", undefined, `${era.name}（${era.romaji}）`);
    option.value = era.name;
    eraSelect.append(option);
  }

  const runToWareki = () => renderToWareki(lib, warekiIso.value, warekiIsoOutput);
  const runFromWareki = () =>
    renderFromWareki(
      lib,
      eraSelect.value,
      numberFieldValue(eraYear),
      numberFieldValue(eraMonth),
      numberFieldValue(eraDay),
      warekiBackOutput,
    );

  makePresets(document.getElementById("wareki-presets"), PRESET_WAREKI, (v) => {
    warekiIso.value = v.iso;
    eraSelect.value = v.era;
    eraYear.value = String(v.eraYear);
    eraMonth.value = String(v.month);
    eraDay.value = String(v.day);
    runToWareki();
    runFromWareki();
  });
  warekiIso.addEventListener("input", runToWareki);
  warekiIso.addEventListener("change", runToWareki);
  for (const node of [eraSelect, eraYear, eraMonth, eraDay]) {
    node.addEventListener("input", runFromWareki);
    node.addEventListener("change", runFromWareki);
  }

  /* panel 4 */
  renderInputCases(lib, document.getElementById("cases-output"));
  renderTimezone(lib, document.getElementById("tz-output"));

  // Prefilled on purpose: the page must show real results — including a
  // provisional badge and a failure — before the visitor touches anything.
  holidayInput.value = PRESET_HOLIDAYS[0].value;
  bizFrom.value = PRESET_BUSINESS[0].value.from;
  bizN.value = String(PRESET_BUSINESS[0].value.n);
  warekiIso.value = PRESET_WAREKI[0].value.iso;
  eraSelect.value = PRESET_WAREKI[0].value.era;
  eraYear.value = String(PRESET_WAREKI[0].value.eraYear);
  eraMonth.value = String(PRESET_WAREKI[0].value.month);
  eraDay.value = String(PRESET_WAREKI[0].value.day);
  runHoliday();
  runBiz();
  runToWareki();
  runFromWareki();

  loading.hidden = true;
  for (const id of ["panel-holiday", "panel-biz", "panel-wareki", "panel-input"]) {
    document.getElementById(id).hidden = false;
  }
  startRequestMeter();
  document.body.dataset.ready = "1";
}

void main();
