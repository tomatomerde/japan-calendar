/**
 * このライブラリが投げる例外。すべて `JapanCalendarError` を継承するので、
 * 呼び出し側は `instanceof JapanCalendarError` でまとめて捕まえられる。
 */

export class JapanCalendarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 引数の型・形式が受け付けられない。 */
export class InvalidDateInputError extends JapanCalendarError {}

/** 対応範囲の外。祝日APIなら 1949〜2099年、和暦なら明治6年1月1日以降。 */
export class OutOfRangeError extends JapanCalendarError {}

/**
 * 明治5年12月3日〜12月31日。
 *
 * 改暦（太政官布告第337号）により、明治5年12月2日の翌日が明治6年1月1日
 * （＝1873-01-01）になった。この29日間はどの暦にも存在しない。
 */
export class MeijiReformError extends JapanCalendarError {
  constructor(month: number, day: number) {
    super(
      `明治5年${month}月${day}日は存在しない。改暦により明治5年12月2日（1872-12-31）の` +
        `翌日が明治6年1月1日（1873-01-01）となり、明治5年12月3日〜31日は暦から失われている。`,
    );
  }
}

/**
 * 和暦の対応範囲外。
 *
 * 明治6年1月1日（1873-01-01）より前は太陰太陽暦（天保暦）で、
 * グレゴリオ暦との単純な写像では変換できないため対応しない。
 */
export class UnsupportedWarekiRangeError extends JapanCalendarError {}

/** 元号の期間内に存在しない和暦日付（例: 昭和64年1月8日）。 */
export class InvalidWarekiDateError extends JapanCalendarError {}
