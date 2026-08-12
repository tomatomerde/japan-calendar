import { describe, expect, it } from 'vitest';
import worker from '../worker/index.ts';

const BASE = 'https://example.com';

function get(path: string): Response {
  return worker.fetch(new Request(`${BASE}${path}`));
}

function request(path: string, method: string): Response {
  return worker.fetch(new Request(`${BASE}${path}`, { method }));
}

type CacheTier = 'long' | 'short' | 'none';

const CACHE_CONTROL: Record<CacheTier, string> = {
  long: 'public, max-age=2592000, immutable',
  short: 'public, max-age=3600',
  none: 'no-store',
};

/**
 * すべての成功レスポンスが満たすべき最低限の契約（content-type / CORS /
 * キャッシュ階層）を一律に検証する。個別テストが特定のフィールドしか
 * 見ていなくても、レスポンスの外枠が壊れたら必ずここで検出される。
 */
async function expectJsonSuccess(res: Response, cache: CacheTier): Promise<unknown> {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
  expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL[cache]);
  return res.json();
}

/**
 * すべてのエラーレスポンスが満たすべき最低限の契約:
 * {error:{type,message}} のエンベロープ形状・content-type・CORS・
 * no-store（エラーがCDNにキャッシュされないこと）を一律に検証する。
 * `expectedType` を渡した場合は、エラーの分類（例外クラス名）が
 * クライアントの分岐に使える具体的な値になっていることまで検証する
 * ---「type はある」だけでなく「type は正しい」を確認するため。
 */
async function expectJsonError(
  res: Response,
  status: number,
  expectedType?: string,
): Promise<{ type: string; message: string }> {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
  expect(res.headers.get('cache-control')).toBe('no-store');
  const body = (await res.json()) as { error?: { type?: unknown; message?: unknown } };
  expect(body.error).toBeTruthy();
  expect(typeof body.error?.type).toBe('string');
  expect(typeof body.error?.message).toBe('string');
  if (expectedType !== undefined) {
    expect(body.error?.type).toBe(expectedType);
  }
  return body.error as { type: string; message: string };
}

const HOLIDAY_CATEGORIES = new Set(['statutory', 'substitute', 'bridge']);

describe('GET /v1/meta', () => {
  it('対応範囲と公式データのメタ情報を返す', async () => {
    const body = (await expectJsonSuccess(get('/v1/meta'), 'short')) as {
      officialData: unknown;
      supportedRange: { holidays: { minYear: number; maxYear: number } };
    };
    expect(body.officialData).toBeTruthy();
    expect(body.supportedRange.holidays).toEqual({ minYear: 1949, maxYear: 2099 });
  });
});

describe('GET /v1/holidays/:year', () => {
  it('確定年（例: 2020）は全件 confirmed=true で long キャッシュ', async () => {
    const body = (await expectJsonSuccess(get('/v1/holidays/2020'), 'long')) as {
      year: number;
      holidays: Array<{ confirmed: boolean }>;
    };
    expect(body.year).toBe(2020);
    expect(body.holidays.length).toBeGreaterThan(0);
    expect(body.holidays.every((h) => h.confirmed)).toBe(true);
  });

  it('暫定年（例: 2030）は short キャッシュ', async () => {
    const body = (await expectJsonSuccess(get('/v1/holidays/2030'), 'short')) as {
      year: number;
      holidays: unknown[];
    };
    expect(body.year).toBe(2030);
    expect(body.holidays.length).toBeGreaterThan(0);
  });

  it('範囲外の年は 400（500 ではない）', async () => {
    await expectJsonError(get('/v1/holidays/1800'), 400, 'OutOfRangeError');
  });
});

describe('GET /v1/holidays/:date — 単日判定', () => {
  it('祝日を正しく判定する（フィールド形状まで検証）', async () => {
    const body = (await expectJsonSuccess(get('/v1/holidays/2026-09-22'), 'long')) as {
      date: string;
      holiday: { date: string; name: string; category: string; confirmed: boolean } | null;
    };
    expect(body.date).toBe('2026-09-22');
    expect(body.holiday).not.toBeNull();
    expect(body.holiday?.date).toBe('2026-09-22');
    expect(body.holiday?.name).toBe('国民の休日');
    expect(body.holiday?.category).toBe('bridge');
    expect(HOLIDAY_CATEGORIES.has(body.holiday?.category ?? '')).toBe(true);
    expect(body.holiday?.confirmed).toBe(true);
  });

  it('祝日ではない日は holiday: null（確定年なので long キャッシュ）', async () => {
    const body = (await expectJsonSuccess(get('/v1/holidays/2026-01-02'), 'long')) as { holiday: unknown };
    expect(body.holiday).toBeNull();
  });

  it('暫定年では、確定していない祝日(confirmed:false)と、祝日ではない(null)の両方が同じ short キャッシュになる', async () => {
    // 2030年は秋分の日がまだ確定していない年。confirmed:false の応答と
    // holiday:null の応答とで、キャッシュ階層の扱いが割れていた回帰を防ぐ。
    const confirmedFalseBody = (await expectJsonSuccess(get('/v1/holidays/2030-09-23'), 'short')) as {
      holiday: { confirmed: boolean } | null;
    };
    expect(confirmedFalseBody.holiday?.confirmed).toBe(false);
    const nullBody = (await expectJsonSuccess(get('/v1/holidays/2030-09-22'), 'short')) as { holiday: unknown };
    expect(nullBody.holiday).toBeNull();
  });

  it('確定年では holiday:null も long キャッシュになる', async () => {
    await expectJsonSuccess(get('/v1/holidays/2020-01-02'), 'long');
  });

  it('不正なURLエスケープは 400（500 ではない）', async () => {
    await expectJsonError(get('/v1/holidays/%'), 400, 'BadRequestError');
    await expectJsonError(get('/v1/holidays/%zz'), 400, 'BadRequestError');
    await expectJsonError(get('/v1/holidays/%E0%A4%A'), 400, 'BadRequestError');
  });

  it('解釈できない日付文字列は 400', async () => {
    await expectJsonError(get('/v1/holidays/notadate'), 400, 'InvalidDateInputError');
    await expectJsonError(get('/v1/holidays/2026-13-01'), 400, 'InvalidDateInputError');
  });
});

describe('GET /v1/business-days/add', () => {
  it('正常系', async () => {
    const body = (await expectJsonSuccess(get('/v1/business-days/add?date=2026-01-01&days=5'), 'short')) as {
      date: string;
    };
    expect(body.date).toBe('2026-01-08');
  });

  it('16進数・指数表記・空白混じりの days は 400', async () => {
    await expectJsonError(get('/v1/business-days/add?date=2026-01-01&days=0x10'), 400, 'BadRequestError');
    await expectJsonError(get('/v1/business-days/add?date=2026-01-01&days=1e3'), 400, 'BadRequestError');
    await expectJsonError(get('/v1/business-days/add?date=2026-01-01&days=%205'), 400, 'BadRequestError');
  });

  it('必須パラメータの欠落は 400', async () => {
    await expectJsonError(get('/v1/business-days/add?days=5'), 400, 'BadRequestError');
    await expectJsonError(get('/v1/business-days/add?date=2026-01-01'), 400, 'BadRequestError');
  });

  it('不正な calendar 値は 400', async () => {
    await expectJsonError(get('/v1/business-days/add?date=2026-01-01&days=1&calendar=xyz'), 400, 'BadRequestError');
  });
});

describe('GET /v1/business-days/between', () => {
  it('正しい営業日数を返す（from/to/calendar のエコーも検証）', async () => {
    const body = (await expectJsonSuccess(get('/v1/business-days/between?from=2026-01-01&to=2026-02-01'), 'short')) as {
      from: string;
      to: string;
      calendar: string;
      businessDays: number;
    };
    // src/businessDays.ts の businessDaysBetween を直接呼んだ結果と突き合わせる。
    expect(body.businessDays).toBe(20);
    expect(body.from).toBe('2026-01-01');
    expect(body.to).toBe('2026-02-01');
    expect(body.calendar).toBe('national');
  });

  it('calendar パラメータが実際にライブラリへ渡っている（national/bank で結果が変わる）', async () => {
    // 2026-12-25〜2027-01-05 は年末年始(1/2, 1/3)を挟むため、
    // calendar が握りつぶされて常に 'national' 扱いになっていると
    // このテストは検出できず両方 6 になる。
    const nationalBody = (await expectJsonSuccess(
      get('/v1/business-days/between?from=2026-12-25&to=2027-01-05&calendar=national'),
      'short',
    )) as { businessDays: number };
    const bankBody = (await expectJsonSuccess(
      get('/v1/business-days/between?from=2026-12-25&to=2027-01-05&calendar=bank'),
      'short',
    )) as { businessDays: number };
    expect(nationalBody.businessDays).toBe(6);
    expect(bankBody.businessDays).toBe(5);
  });
});

describe('GET /v1/wareki', () => {
  it('改元日の変換（本体フィールドと4種の formatted すべてを検証）', async () => {
    const body = (await expectJsonSuccess(get('/v1/wareki?date=1989-01-08'), 'long')) as {
      era: string;
      eraRomaji: string;
      eraAbbr: string;
      eraYear: number;
      isGannen: boolean;
      month: number;
      day: number;
      gregorianYear: number;
      formatted: { ja: string; 'ja-numeric': string; abbr: string; 'abbr-padded': string };
    };
    // 1989-01-08 は改元当日（平成元年1月8日）。month/day は引き継がれ、
    // year だけが元号側に切り替わる、という和暦の核心的な仕様の検証を兼ねる。
    expect(body.era).toBe('平成');
    expect(body.eraRomaji).toBe('Heisei');
    expect(body.eraAbbr).toBe('H');
    expect(body.eraYear).toBe(1);
    expect(body.isGannen).toBe(true);
    expect(body.month).toBe(1);
    expect(body.day).toBe(8);
    expect(body.gregorianYear).toBe(1989);
    expect(body.formatted.ja).toBe('平成元年1月8日');
    expect(body.formatted['ja-numeric']).toBe('平成1年1月8日');
    expect(body.formatted.abbr).toBe('H1.1.8');
    expect(body.formatted['abbr-padded']).toBe('H01.01.08');
  });

  it('対応範囲外は 400', async () => {
    await expectJsonError(get('/v1/wareki?date=1800-01-01'), 400, 'UnsupportedWarekiRangeError');
  });

  // 未来日の和暦は「現行の元号が続く」前提の予報でしかない（平成→令和で
  // 実際に破られている）。予報を 30日 immutable でキャッシュさせないこと。
  it('未来日は short キャッシュになる（元号継続の仮定は予報だから）', async () => {
    await expectJsonSuccess(get('/v1/wareki?date=9999-12-31'), 'short');
  });
});

describe('GET /v1/wareki/reverse', () => {
  it('正常系', async () => {
    const body = (await expectJsonSuccess(get('/v1/wareki/reverse?era=令和&year=1&month=5&day=1'), 'long')) as {
      date: string;
    };
    expect(body.date).toBe('2019-05-01');
  });

  it('month が範囲外なら 400', async () => {
    await expectJsonError(get('/v1/wareki/reverse?era=令和&year=1&month=13&day=1'), 400, 'InvalidWarekiDateError');
  });

  it('未来日に解決される変換は short キャッシュになる', async () => {
    const body = (await expectJsonSuccess(
      get('/v1/wareki/reverse?era=令和&year=7981&month=12&day=31'),
      'short',
    )) as { date: string };
    expect(body.date).toBe('9999-12-31');
  });
});

describe('未知のルート', () => {
  it('404 を返す', async () => {
    await expectJsonError(get('/nope'), 404, 'NotFound');
  });
});

describe('GET / — インデックス', () => {
  it('ルート一覧を返す（デプロイで変わりうるので short キャッシュ）', async () => {
    const body = (await expectJsonSuccess(get('/'), 'short')) as { name: string; routes: string[] };
    expect(body.name).toBe('japan-calendar');
    expect(body.routes).toContain('GET /v1/meta');
  });
});

describe('CORS', () => {
  it('すべてのオリジンからのアクセスを許可する（OPTIONS を含む）', async () => {
    // 204 の OPTIONS 応答は jsonResponse を通らないので個別に確認する。
    // 成功/エラー応答側は expectJsonSuccess/expectJsonError が全ルートで検証済み。
    expect(request('/v1/meta', 'OPTIONS').headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('HTTP メソッド', () => {
  it('OPTIONS は 204 で CORS ヘッダーを返す（HEAD も許可メソッドに含む）', async () => {
    const res = request('/v1/meta', 'OPTIONS');
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS');
  });

  it('HEAD は GET と同じ status/ヘッダーでボディを持たない', async () => {
    const getRes = get('/v1/meta');
    const headRes = request('/v1/meta', 'HEAD');
    expect(headRes.status).toBe(getRes.status);
    expect(headRes.headers.get('cache-control')).toBe(getRes.headers.get('cache-control'));
    const headBody = await headRes.arrayBuffer();
    expect(headBody.byteLength).toBe(0);
  });

  it('HEAD はエラー応答でも status を保つ', async () => {
    const headRes = request('/v1/holidays/%', 'HEAD');
    expect(headRes.status).toBe(400);
  });

  it('GET/HEAD 以外のメソッドは 405 で Allow ヘッダーを持つ', async () => {
    const res = request('/v1/meta', 'POST');
    await expectJsonError(res, 405, 'MethodNotAllowed');
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });
});

describe('敵対的な入力（500 を出さないこと）', () => {
  // 公開HTTP APIとして、クライアント起因の入力でサーバ障害(5xx)を
  // 返してはいけない。ここは wrangler dev に手で投げて確認していた
  // 分を恒久化したもの。
  const cases: ReadonlyArray<readonly [string, string, number]> = [
    ['非常に長いパス', `/v1/holidays/${'9'.repeat(8000)}`, 400],
    ['ヌル文字', '/v1/holidays/%00', 400],
    ['パストラバーサル', '/v1/holidays/..%2f..%2fetc%2fpasswd', 400],
    ['巨大な days', '/v1/business-days/add?date=2026-01-01&days=99999999999999999999', 400],
    ['負の巨大な days', '/v1/business-days/add?date=2026-01-01&days=-99999999999999999999', 400],
    ['空の era', '/v1/wareki/reverse?era=&year=1&month=1&day=1', 400],
    ['未知の era', '/v1/wareki/reverse?era=%E6%9E%B6%E7%A9%BA&year=1&month=1&day=1', 400],
    ['year=0', '/v1/wareki/reverse?era=%E4%BB%A4%E5%92%8C&year=0&month=1&day=1', 400],
    ['year=-1', '/v1/wareki/reverse?era=%E4%BB%A4%E5%92%8C&year=-1&month=1&day=1', 400],
    ['day=0', '/v1/wareki/reverse?era=%E4%BB%A4%E5%92%8C&year=1&month=1&day=0', 400],
    ['全角数字の年', '/v1/holidays/%EF%BC%92%EF%BC%90%EF%BC%92%EF%BC%96', 400],
  ];

  for (const [label, path, status] of cases) {
    it(`${label} は ${status} を返す`, async () => {
      await expectJsonError(get(path), status);
    });
  }

  it('重複したクエリパラメータは最初の値を採用する', async () => {
    // URLSearchParams.get() の仕様。曖昧な入力で落ちたり、
    // 最後の値を拾ったりしないことを固定する。
    const body = (await expectJsonSuccess(
      get('/v1/business-days/add?date=2026-01-01&date=2027-06-15&days=1'),
      'short',
    )) as { date: string };
    expect(body.date).toBe('2026-01-02');
  });

  it('対応範囲いっぱいの問い合わせでも即座に応答する', async () => {
    // Workers の CPU 予算内であること。閉形式でなくなれば桁が変わる。
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) {
      const res = get('/v1/business-days/between?from=1949-01-01&to=2099-12-31&calendar=bank');
      expect(res.status).toBe(200);
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
