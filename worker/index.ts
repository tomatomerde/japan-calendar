/**
 * japan-calendar の Cloudflare Workers 版 HTTP API。
 *
 * ライブラリ本体（src/）を import するだけの薄い層。ランタイム依存は
 * ライブラリ同様ゼロ。
 *
 * ルート:
 *   GET /v1/meta
 *   GET /v1/holidays/:year               例: /v1/holidays/2026
 *   GET /v1/holidays/:date               例: /v1/holidays/2026-09-22
 *   GET /v1/business-days/add?date=&days=&calendar=
 *   GET /v1/business-days/between?from=&to=&calendar=
 *   GET /v1/wareki?date=
 *   GET /v1/wareki/reverse?era=&year=&month=&day=
 */

import { toIsoDate, type CivilDate } from '../src/civil.js';
import { OFFICIAL_META } from '../src/data/official.js';
import { JapanCalendarError } from '../src/errors.js';
import {
  MAX_SUPPORTED_YEAR,
  MIN_SUPPORTED_YEAR,
  assertYearInRange,
  holidaysForYear,
  isHoliday,
} from '../src/holidays.js';
import { addBusinessDays, businessDaysBetween, type CalendarKind } from '../src/businessDays.js';
import { formatWareki, fromWareki, toWareki, WAREKI_SUPPORTED_FROM, type EraInput } from '../src/wareki.js';
import type { Holiday } from '../src/types.js';

/** クエリパラメータの欠落・型不一致など、ライブラリの例外では表現できないリクエスト不正。 */
class BadRequestError extends Error {}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

type CacheTier = 'long' | 'short' | 'none';

const CACHE_CONTROL: Record<CacheTier, string> = {
  // 和暦・確定済み祝日など、後から変わらないデータ。
  long: 'public, max-age=2592000, immutable',
  // 暫定の春分/秋分に依存しうるデータや、メタ情報。
  short: 'public, max-age=3600',
  none: 'no-store',
};

function jsonResponse(data: unknown, status = 200, cache: CacheTier = 'short'): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': CACHE_CONTROL[cache],
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(status: number, type: string, message: string): Response {
  return jsonResponse({ error: { type, message } }, status, 'none');
}

function serializeHoliday(holiday: Holiday): {
  date: string;
  name: string;
  category: Holiday['category'];
  confirmed: boolean;
} {
  return {
    date: toIsoDate(holiday.date),
    name: holiday.name,
    category: holiday.category,
    confirmed: holiday.confirmed,
  };
}

function requireParam(searchParams: URLSearchParams, name: string): string {
  const value = searchParams.get(name);
  if (value === null || value === '') {
    throw new BadRequestError(`必須のクエリパラメータがない: ${name}`);
  }
  return value;
}

function parseCalendar(searchParams: URLSearchParams): CalendarKind {
  const raw = searchParams.get('calendar') ?? 'national';
  if (raw !== 'national' && raw !== 'bank') {
    throw new BadRequestError(`calendar は 'national' か 'bank' のいずれかでなければならない: ${raw}`);
  }
  return raw;
}

function parseInteger(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new BadRequestError(`${name} は整数でなければならない: ${raw}`);
  }
  return value;
}

function parseEraYear(raw: string): number | '元' {
  if (raw === '元') return '元';
  return parseInteger(raw, 'year');
}

const YEAR_ONLY = /^\d{4}$/;

function handleHolidays(param: string): Response {
  if (YEAR_ONLY.test(param)) {
    const year = Number(param);
    assertYearInRange(year);
    const holidays = holidaysForYear(year).map(serializeHoliday);
    const allConfirmed = holidays.every((h) => h.confirmed);
    return jsonResponse({ year, holidays }, 200, allConfirmed ? 'long' : 'short');
  }

  const holiday = isHoliday(param);
  const cache: CacheTier = holiday === null || holiday.confirmed ? 'long' : 'short';
  return jsonResponse({ date: param, holiday: holiday ? serializeHoliday(holiday) : null }, 200, cache);
}

function handleBusinessDaysAdd(searchParams: URLSearchParams): Response {
  const date = requireParam(searchParams, 'date');
  const days = parseInteger(requireParam(searchParams, 'days'), 'days');
  const calendar = parseCalendar(searchParams);
  const result: CivilDate = addBusinessDays(date, days, calendar);
  return jsonResponse({ date: toIsoDate(result) }, 200, 'short');
}

function handleBusinessDaysBetween(searchParams: URLSearchParams): Response {
  const from = requireParam(searchParams, 'from');
  const to = requireParam(searchParams, 'to');
  const calendar = parseCalendar(searchParams);
  const count = businessDaysBetween(from, to, calendar);
  return jsonResponse({ from, to, calendar, businessDays: count }, 200, 'short');
}

function handleWareki(searchParams: URLSearchParams): Response {
  const date = requireParam(searchParams, 'date');
  const wareki = toWareki(date);
  return jsonResponse(
    {
      ...wareki,
      formatted: {
        ja: formatWareki(wareki, 'ja'),
        'ja-numeric': formatWareki(wareki, 'ja-numeric'),
        abbr: formatWareki(wareki, 'abbr'),
        'abbr-padded': formatWareki(wareki, 'abbr-padded'),
      },
    },
    200,
    'long',
  );
}

function handleWarekiReverse(searchParams: URLSearchParams): Response {
  const era = requireParam(searchParams, 'era') as EraInput;
  const year = parseEraYear(requireParam(searchParams, 'year'));
  const month = parseInteger(requireParam(searchParams, 'month'), 'month');
  const day = parseInteger(requireParam(searchParams, 'day'), 'day');
  const civil = fromWareki(era, year, month, day);
  return jsonResponse({ date: toIsoDate(civil) }, 200, 'long');
}

function handleMeta(): Response {
  return jsonResponse(
    {
      officialData: OFFICIAL_META,
      supportedRange: {
        holidays: { minYear: MIN_SUPPORTED_YEAR, maxYear: MAX_SUPPORTED_YEAR },
        wareki: { from: toIsoDate(WAREKI_SUPPORTED_FROM) },
      },
    },
    200,
    'short',
  );
}

function handleIndex(): Response {
  return jsonResponse(
    {
      name: 'japan-calendar',
      routes: [
        'GET /v1/meta',
        'GET /v1/holidays/:year',
        'GET /v1/holidays/:date',
        'GET /v1/business-days/add?date=&days=&calendar=',
        'GET /v1/business-days/between?from=&to=&calendar=',
        'GET /v1/wareki?date=',
        'GET /v1/wareki/reverse?era=&year=&month=&day=',
      ],
    },
    200,
    'long',
  );
}

function route(request: Request): Response {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  if (pathname === '/' || pathname === '') return handleIndex();
  if (pathname === '/v1/meta') return handleMeta();

  const holidaysMatch = /^\/v1\/holidays\/([^/]+)$/.exec(pathname);
  if (holidaysMatch !== null) return handleHolidays(decodeURIComponent(holidaysMatch[1] as string));

  if (pathname === '/v1/business-days/add') return handleBusinessDaysAdd(searchParams);
  if (pathname === '/v1/business-days/between') return handleBusinessDaysBetween(searchParams);
  if (pathname === '/v1/wareki') return handleWareki(searchParams);
  if (pathname === '/v1/wareki/reverse') return handleWarekiReverse(searchParams);

  return errorResponse(404, 'NotFound', `不明なルート: ${pathname}`);
}

export default {
  fetch(request: Request): Response {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return errorResponse(405, 'MethodNotAllowed', `${request.method} は許可されていない。GET のみ。`);
    }

    try {
      return route(request);
    } catch (error) {
      if (error instanceof JapanCalendarError || error instanceof BadRequestError) {
        return errorResponse(400, error.constructor.name, error.message);
      }
      // 想定外の例外。詳細を漏らさず、ログにだけ残す。
      console.error(error);
      return errorResponse(500, 'InternalError', '内部エラーが発生した。');
    }
  },
};
