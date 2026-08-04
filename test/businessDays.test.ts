import { describe, expect, it } from 'vitest';
import { addBusinessDays, businessDaysBetween, isBusinessDay, type CalendarKind } from '../src/businessDays.ts';
import { civilFromDays, daysFromCivil, toIsoDate } from '../src/civil.ts';
import { OutOfRangeError } from '../src/errors.ts';
import { MAX_SUPPORTED_YEAR, MIN_SUPPORTED_YEAR } from '../src/holidays.ts';

describe('isBusinessDay', () => {
  it('土日は両カレンダーとも非営業日', () => {
    expect(isBusinessDay('2026-08-01')).toBe(false); // 土
    expect(isBusinessDay('2026-08-02')).toBe(false); // 日
    expect(isBusinessDay('2026-08-01', 'bank')).toBe(false);
    expect(isBusinessDay('2026-08-02', 'bank')).toBe(false);
  });

  it('祝日は両カレンダーとも非営業日', () => {
    expect(isBusinessDay('2026-01-01')).toBe(false); // 元日
    expect(isBusinessDay('2026-01-01', 'bank')).toBe(false);
    expect(isBusinessDay('2026-09-22')).toBe(false); // 国民の休日
  });

  it('平日の祝日でない日は営業日', () => {
    expect(isBusinessDay('2026-08-04')).toBe(true); // 火曜
  });

  it("'national' は年末年始でも祝日でなければ営業日", () => {
    expect(isBusinessDay('2026-12-30')).toBe(true); // 水曜、祝日ではない
    expect(isBusinessDay('2026-12-31')).toBe(true);
    expect(isBusinessDay('2026-01-02')).toBe(true);
  });

  it("'bank' は12/31・1/2・1/3が非営業日", () => {
    expect(isBusinessDay('2026-12-31', 'bank')).toBe(false);
    expect(isBusinessDay('2026-01-02', 'bank')).toBe(false);
    expect(isBusinessDay('2026-01-03', 'bank')).toBe(false);
    // 1/1は既に元日として両方とも非営業日
    expect(isBusinessDay('2026-01-01', 'bank')).toBe(false);
  });

  it('範囲外はエラー', () => {
    expect(() => isBusinessDay('1948-12-31')).toThrow(OutOfRangeError);
    expect(() => isBusinessDay('2100-01-01')).toThrow(OutOfRangeError);
  });
});

describe('addBusinessDays', () => {
  it('n=0は非営業日であっても補正せずそのまま返す', () => {
    expect(addBusinessDays('2026-08-01', 0)).toEqual({ year: 2026, month: 8, day: 1 }); // 土曜
    expect(addBusinessDays('2026-01-01', 0)).toEqual({ year: 2026, month: 1, day: 1 }); // 元日
  });

  it('正のnは週末・祝日を飛ばして進む', () => {
    // 2026-07-31(金) の翌営業日は土日を飛ばして 8/3(月)
    expect(addBusinessDays('2026-07-31', 1)).toEqual({ year: 2026, month: 8, day: 3 });
    // 2026-09-18(金)から3営業日後: 9/19,20(土日)を飛ばし 9/21(月,敬老の日で祝日)も飛ばし、
    // 9/22(火,国民の休日)も飛ばし、9/23(水,秋分の日)も飛ばし、9/24(木)が1営業日目、
    // 9/25(金)が2営業日目、9/28(月)が3営業日目。
    expect(addBusinessDays('2026-09-18', 3)).toEqual({ year: 2026, month: 9, day: 28 });
  });

  it('負のnは過去方向に進む', () => {
    // 2026-08-03(月)の1営業日前は週末を飛ばして 7/31(金)
    expect(addBusinessDays('2026-08-03', -1)).toEqual({ year: 2026, month: 7, day: 31 });
  });

  it('bankカレンダーでは年末年始も飛ばす', () => {
    // 2026-12-30(水)の1営業日後。12/31(木)は銀行休業日、1/1(金)は元日、
    // 1/2(土)・1/3(日)は週末で飛ばされ、1/4(月)が最初の営業日になる。
    expect(addBusinessDays('2026-12-30', 1, 'bank')).toEqual({ year: 2027, month: 1, day: 4 });
    // nationalなら12/31は営業日なのでそのまま翌日
    expect(addBusinessDays('2026-12-30', 1, 'national')).toEqual({ year: 2026, month: 12, day: 31 });
  });

  it('範囲外に出るとエラー', () => {
    expect(() => addBusinessDays('2099-12-30', 5)).toThrow(OutOfRangeError);
  });
});

describe('businessDaysBetween', () => {
  it('半開区間 [from, to) で数える。from===toは0', () => {
    expect(businessDaysBetween('2026-08-04', '2026-08-04')).toBe(0);
  });

  it('通常の週の平日日数を数える', () => {
    // 2026-08-03(月)〜08-08(土) の半開区間: 月火水木金(5営業日)、土は含まれない
    expect(businessDaysBetween('2026-08-03', '2026-08-08')).toBe(5);
  });

  it('祝日を挟む区間', () => {
    // 2026-09-19(土)〜09-26(土): 9/21(月,祝),9/22(火,祝),9/23(水,祝) を除く
    // 9/19(土),20(日)は元々非営業日。営業日は 9/24(木),9/25(金) の2日。
    expect(businessDaysBetween('2026-09-19', '2026-09-26')).toBe(2);
  });

  it('to < from なら負値', () => {
    const forward = businessDaysBetween('2026-08-03', '2026-08-08');
    const backward = businessDaysBetween('2026-08-08', '2026-08-03');
    expect(backward).toBe(-forward);
  });

  it('bankカレンダーで年末年始をまたぐ区間', () => {
    // 2026-12-29(火)〜2027-01-06(水)の半開区間。
    // 12/29(火),12/30(水),12/31(木),1/1(金,元日祝),1/2(土),1/3(日),1/4(月),1/5(火)。
    // national: 1/1(祝日)と1/2,1/3(週末)を除く 12/29,12/30,12/31,1/4,1/5 の5日。
    expect(businessDaysBetween('2026-12-29', '2027-01-06', 'national')).toBe(5);
    // bank: さらに12/31も除外されるので 12/29,12/30,1/4,1/5 の4日。
    expect(businessDaysBetween('2026-12-29', '2027-01-06', 'bank')).toBe(4);
  });

  /**
   * businessDaysBetween は年単位の閉形式カウント (fullYearBusinessDayCount)
   * を使って年またぎの区間を高速に計算する。ここでは素朴な「1日ずつ
   * isBusinessDay を呼んで数える」実装との差分がないことを、年境界・
   * うるう年境界を含む多数のケースで確認する。
   */
  function naiveBetween(from: string, to: string, calendar: CalendarKind): number {
    const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
    const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
    let lo = daysFromCivil(fy, fm, fd);
    let hi = daysFromCivil(ty, tm, td);
    const sign = lo <= hi ? 1 : -1;
    if (lo > hi) [lo, hi] = [hi, lo];
    let count = 0;
    for (let d = lo; d < hi; d += 1) {
      if (isBusinessDay(civilFromDays(d), calendar)) count += 1;
    }
    return count * sign;
  }

  it('年境界・うるう年境界で素朴な実装と一致する', () => {
    const cases: Array<[string, string]> = [
      ['2024-01-01', '2024-12-31'], // うるう年フル
      ['2023-01-01', '2023-12-31'], // 平年フル
      ['2023-12-31', '2024-01-01'], // 年境界1日
      ['2023-12-30', '2024-01-02'], // 年境界を数日またぐ
      [toIsoDate({ year: MIN_SUPPORTED_YEAR, month: 1, day: 1 }), toIsoDate({ year: MIN_SUPPORTED_YEAR + 1, month: 1, day: 1 })],
      [toIsoDate({ year: MAX_SUPPORTED_YEAR - 1, month: 1, day: 1 }), toIsoDate({ year: MAX_SUPPORTED_YEAR, month: 12, day: 31 })],
    ];
    for (const [from, to] of cases) {
      for (const calendar of ['national', 'bank'] as const) {
        expect(businessDaysBetween(from, to, calendar), `${from} -> ${to} (${calendar})`).toBe(
          naiveBetween(from, to, calendar),
        );
      }
    }
  });

  /**
   * businessDaysBetween は、区間が2つ以上の暦年をまたぐとき
   * fullYearBusinessDayCount（閉形式の年間営業日数）を使う。上の
   * テストケースはどれも「区間の年差が0か1」で、このパスを一度も
   * 通らない（fullYearBusinessDayCount が完全年に対して呼ばれるのは
   * 年差が2以上のときだけ）。その状態で fullYearBusinessDayCount の
   * 'bank' 分岐をまるごと無効化しても全テストが通ることを確認済みで、
   * このテストはそのカバレッジの穴を塞ぐためにある。
   *
   * 対応範囲の全ての年について「その年をちょうど1つだけ完全に含む
   * 2年区間」を素朴な日単位実装と突き合わせる。
   */
  it('完全な暦年を含む区間で素朴な実装と一致する（全年・両カレンダー）', () => {
    const mismatches: string[] = [];
    for (let year = MIN_SUPPORTED_YEAR; year <= MAX_SUPPORTED_YEAR - 2; year += 1) {
      const from = toIsoDate({ year, month: 6, day: 15 });
      const to = toIsoDate({ year: year + 2, month: 6, day: 15 });
      for (const calendar of ['national', 'bank'] as const) {
        const fast = businessDaysBetween(from, to, calendar);
        const slow = naiveBetween(from, to, calendar);
        if (fast !== slow) mismatches.push(`${from} -> ${to} (${calendar}): fast=${fast} naive=${slow}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('対応範囲の境界 — 範囲外は黙って誤答せず必ず例外', () => {
  // 範囲外に踏み出す計算は、例外ではなく「それらしい値」を返すのが
  // いちばん危険。src/businessDays.ts の assertYearInRange は5箇所あり、
  // 1つずつ外して実際の出力を比べたところ、3箇所は挙動が変わり（＝必要）、
  // 2箇所は holidaysForYear 経由で間接的に守られていて冗長だった:
  //
  //   必要 : addBusinessDays の開始日     外すと n=0 で範囲外の日をそのまま返す
  //   必要 : businessDaysBetween の from  外すと 2100-01-01 起点で -23 を返す
  //   必要 : businessDaysBetween の to    外すと 2100-01-01 終点で 23 を返す
  //   冗長 : addBusinessDays の歩進中 / isBusinessDay
  //
  // 下のケースはこの3箇所を個別に踏むよう選んである。from 側は逆順
  // （範囲外を始点にする）でないと踏めない。
  it('境界そのものは受け付ける', () => {
    expect(() => isBusinessDay('1949-01-01')).not.toThrow();
    expect(() => isBusinessDay('2099-12-31')).not.toThrow();
    expect(businessDaysBetween('1949-01-01', '2099-12-31')).toBeGreaterThan(0);
  });

  it('範囲の外側は OutOfRangeError', () => {
    expect(() => isBusinessDay('1948-12-31')).toThrow(OutOfRangeError);
    expect(() => isBusinessDay('2100-01-01')).toThrow(OutOfRangeError);
  });

  it('addBusinessDays が歩進中に範囲外へ出たら OutOfRangeError', () => {
    // 開始日は範囲内でも、歩進の途中で外へ出る場合。
    expect(() => addBusinessDays('2099-12-28', 5)).toThrow(OutOfRangeError);
    expect(() => addBusinessDays('1949-01-04', -5)).toThrow(OutOfRangeError);
  });

  it('businessDaysBetween は from/to のどちらが範囲外でも OutOfRangeError', () => {
    expect(() => businessDaysBetween('1948-12-31', '1949-01-31')).toThrow(OutOfRangeError);
    // to 側のチェックを踏む。外すと 23 を返す。
    expect(() => businessDaysBetween('2099-12-01', '2100-01-01')).toThrow(OutOfRangeError);
    // from 側のチェックを踏む。順方向だと別経路で捕まるため、逆順で確かめる。
    // 外すと -23 を返す。
    expect(() => businessDaysBetween('2100-01-01', '2099-12-01')).toThrow(OutOfRangeError);
  });

  it('addBusinessDays(date, 0) は範囲内なら非営業日でもそのまま返し、範囲外なら投げる', () => {
    expect(addBusinessDays('2099-12-31', 0)).toEqual({ year: 2099, month: 12, day: 31 });
    expect(addBusinessDays('1949-01-01', 0)).toEqual({ year: 1949, month: 1, day: 1 });
    // n=0 は歩進しないので、開始日のチェックだけが範囲外を止めている。
    expect(() => addBusinessDays('2100-01-01', 0)).toThrow(OutOfRangeError);
    expect(() => addBusinessDays('1948-12-31', 0)).toThrow(OutOfRangeError);
  });
});
