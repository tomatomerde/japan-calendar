/**
 * The error classes' `name` must survive minification.
 *
 * `name` is part of an Error's public contract: it's what appears in logs
 * and what code that can't import the classes branches on (the Worker
 * puts it straight into the response's `error.type`). Deriving it from
 * the class identifier -- `this.name = new.target.name` -- looks
 * equivalent but breaks the moment a consumer bundles the package with a
 * minifier, which renames the identifier. That is not hypothetical: it's
 * what any consumer targeting a browser or a serverless runtime does by
 * default, and it produced `name` values of `d`, `u`, and `y` before this
 * was fixed.
 *
 * The first block below catches an assignment being dropped. Only the
 * second block -- which actually runs the minifier -- catches a
 * regression back to a derived name, since that looks correct until it's
 * minified.
 */

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  InvalidDateInputError,
  InvalidWarekiDateError,
  JapanCalendarError,
  MeijiReformError,
  OutOfRangeError,
  UnsupportedWarekiRangeError,
  describeValue,
} from '../src/errors.ts';

describe('エラーの name は明示的なリテラル', () => {
  it('各クラスが自分のクラス名を name に持つ', () => {
    expect(new JapanCalendarError('x').name).toBe('JapanCalendarError');
    expect(new InvalidDateInputError('x').name).toBe('InvalidDateInputError');
    expect(new OutOfRangeError('x').name).toBe('OutOfRangeError');
    expect(new UnsupportedWarekiRangeError('x').name).toBe('UnsupportedWarekiRangeError');
    expect(new InvalidWarekiDateError('x').name).toBe('InvalidWarekiDateError');
    expect(new MeijiReformError(12, 15).name).toBe('MeijiReformError');
  });

  it('すべて JapanCalendarError でまとめて catch できる', () => {
    for (const error of [
      new InvalidDateInputError('x'),
      new OutOfRangeError('x'),
      new UnsupportedWarekiRangeError('x'),
      new InvalidWarekiDateError('x'),
      new MeijiReformError(12, 15),
    ]) {
      expect(error).toBeInstanceOf(JapanCalendarError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('message は保持される', () => {
    expect(new InvalidDateInputError('boom').message).toBe('boom');
  });
});

describe('describeValue の描画', () => {
  it('bigint は n 付きで、同じ桁の number と区別できる', () => {
    // 区別しないと `isBusinessDay(10n)` のメッセージが
    // "Value cannot be interpreted as a date: 10" になり、
    // 何の問題もない数値が撥ねられたようにしか読めない。
    expect(describeValue(10n)).toBe('10n');
    expect(describeValue(10)).toBe('10');
    expect(describeValue(-1n)).toBe('-1n');
  });

  it('巨大な bigint も上限で切り詰められる', () => {
    // 上限は「呼び出し側のデータを際限なく反射しない」ためのもの。
    // bigint だけがこれを迂回して 5002 文字のメッセージを作っていた。
    const huge = 10n ** 5000n; // 10 進 5001 桁 + 'n'
    const rendered = describeValue(huge);
    expect(rendered.length).toBeLessThan(250);
    expect(rendered).toContain('…');
    expect(rendered).toContain('(5002 chars)');
  });

  it('サロゲートペアの途中で切らない', () => {
    // 'a'.repeat(198) は JSON.stringify の開き引用符と合わせて 199 文字。
    // 200 文字目に U+1F5FE（🗾 = D83D DDFE）の上位サロゲートだけが残り、
    // 単独では文字として復号できない文字列になっていた。
    const rendered = describeValue(`${'a'.repeat(198)}🗾tail`);
    const body = rendered.slice(0, rendered.indexOf('…'));
    expect(isWellFormed(body)).toBe(true);
    // 切り詰めた本体は上位サロゲートを落として 199 文字になる。
    expect(body).toBe(`"${'a'.repeat(198)}`);
  });

  it('サロゲートペアが境界に収まるならそのまま残す', () => {
    // 一律に1文字削ると、切る必要のないペアまで削ってしまう。
    const rendered = describeValue(`${'a'.repeat(197)}🗾tail`);
    const body = rendered.slice(0, rendered.indexOf('…'));
    expect(isWellFormed(body)).toBe(true);
    expect(body).toBe(`"${'a'.repeat(197)}🗾`);
  });
});

/**
 * `String.prototype.isWellFormed` is Node 20+, which is this package's floor,
 * but the test runs on the dev Node. Implemented here so the assertion does
 * not depend on the runtime having it.
 */
function isWellFormed(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

describe('ミニファイしても name が壊れない', () => {
  it('esbuild --minify を通しても各 name がリテラルのまま残る', async () => {
    // ライブラリを実際にバンドル＆ミニファイし、その中で例外を発生させて
    // name を集める。`new.target.name` 方式に戻すと、ここが 'd' や 'u' の
    // ような潰れた識別子になって落ちる。
    const entry = `
      import { isHoliday } from './src/index.ts';
      import { toWareki, fromWareki } from './src/wareki.ts';
      const names = [];
      const grab = (fn) => { try { fn(); names.push('(no throw)'); } catch (e) { names.push(e.name); } };
      grab(() => isHoliday('notadate'));
      grab(() => isHoliday('2200-01-01'));
      grab(() => toWareki('1800-01-01'));
      grab(() => fromWareki('明治', 5, 12, 15));
      grab(() => fromWareki('昭和', 64, 1, 8));
      globalThis.__names = names;
    `;
    const result = await build({
      stdin: { contents: entry, resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' },
      bundle: true,
      minify: true,
      format: 'esm',
      write: false,
      platform: 'neutral',
    });
    const code = result.outputFiles[0]?.text ?? '';
    expect(code.length).toBeGreaterThan(0);
    const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    void module;
    expect((globalThis as unknown as { __names: string[] }).__names).toEqual([
      'InvalidDateInputError',
      'OutOfRangeError',
      'UnsupportedWarekiRangeError',
      'MeijiReformError',
      'InvalidWarekiDateError',
    ]);
  });
});
