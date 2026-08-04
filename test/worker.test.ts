import { describe, expect, it } from 'vitest';
import worker from '../worker/index.ts';

const BASE = 'https://example.com';

function get(path: string): Response {
  return worker.fetch(new Request(`${BASE}${path}`));
}

function request(path: string, method: string): Response {
  return worker.fetch(new Request(`${BASE}${path}`, { method }));
}

describe('GET /v1/meta', () => {
  it('対応範囲と公式データのメタ情報を返す', async () => {
    const res = get('/v1/meta');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      officialData: unknown;
      supportedRange: { holidays: { minYear: number; maxYear: number } };
    };
    expect(body.officialData).toBeTruthy();
    expect(body.supportedRange.holidays).toEqual({ minYear: 1949, maxYear: 2099 });
  });
});

describe('GET /v1/holidays/:year', () => {
  it('確定年（例: 2020）は全件 confirmed=true で long キャッシュ', async () => {
    const res = get('/v1/holidays/2020');
    expect(res.headers.get('cache-control')).toBe('public, max-age=2592000, immutable');
    const body = (await res.json()) as { holidays: Array<{ confirmed: boolean }> };
    expect(body.holidays.every((h) => h.confirmed)).toBe(true);
  });

  it('暫定年（例: 2030）は short キャッシュ', async () => {
    const res = get('/v1/holidays/2030');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('範囲外の年は 400（500 ではない）', async () => {
    const res = get('/v1/holidays/1800');
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/holidays/:date — 単日判定', () => {
  it('祝日を正しく判定する', async () => {
    const res = get('/v1/holidays/2026-09-22');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { holiday: { name: string } | null };
    expect(body.holiday?.name).toBe('国民の休日');
  });

  it('祝日ではない日は holiday: null', async () => {
    const res = get('/v1/holidays/2026-01-02');
    const body = (await res.json()) as { holiday: unknown };
    expect(body.holiday).toBeNull();
  });

  it('暫定年では、確定していない祝日(confirmed:false)と、祝日ではない(null)の両方が同じ short キャッシュになる', async () => {
    // 2030年は秋分の日がまだ確定していない年。confirmed:false の応答と
    // holiday:null の応答とで、キャッシュ階層の扱いが割れていた回帰を防ぐ。
    const confirmedFalse = get('/v1/holidays/2030-09-23');
    const nullAnswer = get('/v1/holidays/2030-09-22');
    expect(confirmedFalse.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(nullAnswer.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('確定年では holiday:null も long キャッシュになる', async () => {
    const res = get('/v1/holidays/2020-01-02');
    expect(res.headers.get('cache-control')).toBe('public, max-age=2592000, immutable');
  });

  it('不正なURLエスケープは 400（500 ではない）', async () => {
    expect(get('/v1/holidays/%').status).toBe(400);
    expect(get('/v1/holidays/%zz').status).toBe(400);
    expect(get('/v1/holidays/%E0%A4%A').status).toBe(400);
  });

  it('解釈できない日付文字列は 400', async () => {
    expect(get('/v1/holidays/notadate').status).toBe(400);
    expect(get('/v1/holidays/2026-13-01').status).toBe(400);
  });
});

describe('GET /v1/business-days/add', () => {
  it('正常系', async () => {
    const res = get('/v1/business-days/add?date=2026-01-01&days=5');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string };
    expect(body.date).toBe('2026-01-08');
  });

  it('16進数・指数表記・空白混じりの days は 400', async () => {
    expect(get('/v1/business-days/add?date=2026-01-01&days=0x10').status).toBe(400);
    expect(get('/v1/business-days/add?date=2026-01-01&days=1e3').status).toBe(400);
    expect(get('/v1/business-days/add?date=2026-01-01&days=%205').status).toBe(400);
  });

  it('必須パラメータの欠落は 400', async () => {
    expect(get('/v1/business-days/add?days=5').status).toBe(400);
    expect(get('/v1/business-days/add?date=2026-01-01').status).toBe(400);
  });

  it('不正な calendar 値は 400', async () => {
    expect(get('/v1/business-days/add?date=2026-01-01&days=1&calendar=xyz').status).toBe(400);
  });
});

describe('GET /v1/business-days/between', () => {
  it('正常系', async () => {
    const res = get('/v1/business-days/between?from=2026-01-01&to=2026-02-01');
    expect(res.status).toBe(200);
  });
});

describe('GET /v1/wareki', () => {
  it('改元日の変換', async () => {
    const res = get('/v1/wareki?date=1989-01-08');
    const body = (await res.json()) as { formatted: { ja: string } };
    expect(body.formatted.ja).toBe('平成元年1月8日');
  });

  it('対応範囲外は 400', async () => {
    expect(get('/v1/wareki?date=1800-01-01').status).toBe(400);
  });
});

describe('GET /v1/wareki/reverse', () => {
  it('正常系', async () => {
    const res = get('/v1/wareki/reverse?era=令和&year=1&month=5&day=1');
    const body = (await res.json()) as { date: string };
    expect(body.date).toBe('2019-05-01');
  });

  it('month が範囲外なら 400', async () => {
    expect(get('/v1/wareki/reverse?era=令和&year=1&month=13&day=1').status).toBe(400);
  });
});

describe('未知のルート', () => {
  it('404 を返す', async () => {
    expect(get('/nope').status).toBe(404);
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
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });
});
