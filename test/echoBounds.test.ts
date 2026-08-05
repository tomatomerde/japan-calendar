/**
 * 呼び出し側の入力が、そのままエラーメッセージに反射されないこと。
 *
 * Worker は `error.message` を 400 の本文にそのまま入れる。上限が無いと、
 * 50KB のクエリパラメータを送れば 50KB がそのまま返ってきて、
 * 公開APIがエコーサービスになり、Cloudflare のログもその分だけ膨らむ。
 * ライブラリ側でも、メッセージはログに載る以上は同じ話。
 */

import { describe, expect, it } from 'vitest';
import worker from '../worker/index.ts';
import { civilFromInstant, formatWareki, fromWareki, isBusinessDay, toCivilDate } from '../src/index.ts';

const BIG = 'x'.repeat(50_000);
/** describeValue の上限 200 文字 + 各メッセージの定型文の余裕。 */
const CEILING = 600;

describe('Worker: 長い入力を 400 本文に反射しない', () => {
  const routes: [string, string][] = [
    ['date パラメータ', `/v1/business-days/add?date=${BIG}&days=1`],
    ['calendar パラメータ', `/v1/business-days/add?date=2026-08-03&days=1&calendar=${BIG}`],
    ['days パラメータ', `/v1/business-days/add?date=2026-08-03&days=${BIG}`],
    ['era パラメータ', `/v1/wareki/reverse?era=${BIG}&year=1&month=5&day=1`],
    ['holidays のパス要素', `/v1/holidays/${BIG}`],
    ['from パラメータ', `/v1/business-days/between?from=${BIG}&to=2026-08-08`],
    ['wareki の date', `/v1/wareki?date=${BIG}`],
  ];

  // 400 以外のエラー経路も同じく反射しうる。
  it('404 が未知のパス全体を反射しない', async () => {
    const res = worker.fetch(new Request(`https://example.com/${BIG}`));
    const body = (await res.json()) as { error: { message: string } };
    expect(res.status).toBe(404);
    expect(body.error.message.length).toBeLessThan(CEILING);
  });

  it('不正なURLエスケープがパス要素を反射しない', async () => {
    const res = worker.fetch(new Request(`https://example.com/v1/holidays/${BIG}%`));
    const body = (await res.json()) as { error: { message: string } };
    expect(res.status).toBe(400);
    expect(body.error.message.length).toBeLessThan(CEILING);
  });

  it('405 がメソッド名を反射しない', async () => {
    // Request は長さも文字種も検証しないので、50KB のメソッド名は実際に作れる。
    const res = worker.fetch(new Request('https://example.com/v1/meta', { method: BIG }));
    const body = (await res.json()) as { error: { message: string } };
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
    expect(body.error.message.length).toBeLessThan(CEILING);
  });

  it('通常のメソッドは 405 でそのまま読める', () => {
    const res = worker.fetch(new Request('https://example.com/v1/meta', { method: 'DELETE' }));
    expect(res.status).toBe(405);
  });

  for (const [label, path] of routes) {
    it(`${label}`, async () => {
      const res = worker.fetch(new Request(`https://example.com${path}`));
      const body = (await res.json()) as { error: { type: string; message: string } };
      expect(res.status).toBe(400);
      expect(body.error.message.length).toBeLessThan(CEILING);
      // 入力長に比例していないことを、桁で確かめる。
      expect(body.error.message.length).toBeLessThan(BIG.length / 10);
    });
  }
});

describe('ライブラリ: 長い入力をメッセージに反射しない', () => {
  const call: [string, () => unknown][] = [
    ['toCivilDate（文字列）', () => toCivilDate(BIG)],
    ['isBusinessDay（オブジェクト）', () => isBusinessDay({ note: BIG } as never)],
    ['isBusinessDay（calendar）', () => isBusinessDay('2026-08-03', BIG as never)],
    ['fromWareki（元号）', () => fromWareki(BIG as never, 1, 5, 1)],
    // レビューで発見: fromWareki の eraYear/month/day は describeValue を経由しておらず、
    // 素の String() で全反射していた（呼び出し側は Worker の parseInteger を経由しない
    // ため、この経路が唯一の防御線）。
    ['fromWareki（元号年）', () => fromWareki('R', BIG as never, 5, 1)],
    ['fromWareki（月）', () => fromWareki('R', 1, BIG as never, 1)],
    ['civilFromInstant（epochMs）', () => civilFromInstant(BIG as never)],
    ['formatWareki（format）', () => formatWareki(toCivilDate('2019-05-01') as never, BIG as never)],
  ];

  for (const [label, fn] of call) {
    it(label, () => {
      let message = '';
      try {
        fn();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(message.length).toBeLessThan(CEILING);
    });
  }

  it('打ち切られた旨が分かる形で出る', () => {
    let message = '';
    try {
      toCivilDate(BIG);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('…');
    expect(message).toContain(`${BIG.length + 2} chars`); // JSON.stringify の引用符ぶん
  });
});
