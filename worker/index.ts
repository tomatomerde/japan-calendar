/**
 * japan-calendar's Cloudflare Workers HTTP API.
 *
 * A thin layer that just imports the library (src/). Zero runtime
 * dependencies, same as the library.
 *
 * Routes:
 *   GET /v1/meta
 *   GET /v1/holidays/:year               e.g. /v1/holidays/2026
 *   GET /v1/holidays/:date                e.g. /v1/holidays/2026-09-22
 *   GET /v1/business-days/add?date=&days=&calendar=
 *   GET /v1/business-days/between?from=&to=&calendar=
 *   GET /v1/wareki?date=
 *   GET /v1/wareki/reverse?era=&year=&month=&day=
 */

import { toIsoDate, type CivilDate } from '../src/civil.js';
import { OFFICIAL_META } from '../src/data/official.js';
import { JapanCalendarError, describeValue } from '../src/errors.js';
import { MAX_SUPPORTED_YEAR, MIN_SUPPORTED_YEAR, assertYearInRange, holidaysForYear } from '../src/holidays.js';
import { toCivilDate } from '../src/input.js';
import { addBusinessDays, businessDaysBetween, type CalendarKind } from '../src/businessDays.js';
import { formatWareki, fromWareki, toWareki, WAREKI_SUPPORTED_FROM, type EraInput } from '../src/wareki.js';
import type { Holiday } from '../src/types.js';

/** A malformed request (missing/mistyped query parameters, etc.) that the library's own exceptions can't express. */
class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    // A literal, not the class identifier -- see src/errors.ts. This name
    // is what clients see in the response's `error.type`.
    this.name = 'BadRequestError';
  }
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
};

type CacheTier = 'long' | 'short' | 'none';

const CACHE_CONTROL: Record<CacheTier, string> = {
  // Data that never changes later, such as wareki conversions or finalized holidays.
  long: 'public, max-age=2592000, immutable',
  // Data that may depend on a tentative equinox date, or metadata.
  short: 'public, max-age=3600',
  none: 'no-store',
};

function jsonResponse(
  data: unknown,
  status = 200,
  cache: CacheTier = 'short',
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': CACHE_CONTROL[cache],
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function errorResponse(status: number, type: string, message: string, extraHeaders?: Record<string, string>): Response {
  return jsonResponse({ error: { type, message } }, status, 'none', extraHeaders);
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
    throw new BadRequestError(`Missing required query parameter: ${name}`);
  }
  return value;
}

function parseCalendar(searchParams: URLSearchParams): CalendarKind {
  const raw = searchParams.get('calendar') ?? 'national';
  if (raw !== 'national' && raw !== 'bank') {
    throw new BadRequestError(`calendar must be either 'national' or 'bank': ${describeValue(raw)}`);
  }
  return raw;
}

const INTEGER = /^-?\d+$/;

function parseInteger(raw: string, name: string): number {
  if (!INTEGER.test(raw)) {
    throw new BadRequestError(`${name} must be an integer: ${describeValue(raw)}`);
  }
  return Number(raw);
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

  const date = toCivilDate(param);
  assertYearInRange(date.year);
  const holidays = holidaysForYear(date.year);
  const allConfirmed = holidays.every((h) => h.confirmed);
  const holiday = holidays.find((h) => h.date.month === date.month && h.date.day === date.day) ?? null;
  return jsonResponse(
    { date: param, holiday: holiday ? serializeHoliday(holiday) : null },
    200,
    allConfirmed ? 'long' : 'short',
  );
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
  if (holidaysMatch !== null) {
    let param: string;
    try {
      param = decodeURIComponent(holidaysMatch[1] as string);
    } catch {
      throw new BadRequestError(`Malformed URL escape sequence in path: ${describeValue(holidaysMatch[1])}`);
    }
    return handleHolidays(param);
  }

  if (pathname === '/v1/business-days/add') return handleBusinessDaysAdd(searchParams);
  if (pathname === '/v1/business-days/between') return handleBusinessDaysBetween(searchParams);
  if (pathname === '/v1/wareki') return handleWareki(searchParams);
  if (pathname === '/v1/wareki/reverse') return handleWarekiReverse(searchParams);

  return errorResponse(404, 'NotFound', `Unknown route: ${describeValue(pathname)}`);
}

export default {
  fetch(request: Request): Response {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // RFC 9110 §15.5.6 requires a 405 response to include Allow.
      return errorResponse(405, 'MethodNotAllowed', `${describeValue(request.method)} is not allowed. Only GET and HEAD are supported.`, {
        allow: 'GET, HEAD',
      });
    }

    try {
      const response = route(request);
      // HEAD must mirror GET's status/headers with no body (RFC 9110 9.3.2).
      return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
    } catch (error) {
      if (error instanceof JapanCalendarError || error instanceof BadRequestError) {
        // error.name, not error.constructor.name: the latter reads the class
        // identifier, which a minifier renames (see src/errors.ts).
        return errorResponse(400, error.name, error.message);
      }
      // Unexpected exception. Don't leak details to the client, just log it.
      console.error(error);
      return errorResponse(500, 'InternalError', 'An internal error occurred.');
    }
  },
};
