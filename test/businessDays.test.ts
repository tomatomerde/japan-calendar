import { describe, expect, it } from 'vitest';
import { addBusinessDays, businessDaysBetween, isBusinessDay } from '../src/businessDays.ts';
import { OutOfRangeError } from '../src/errors.ts';

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
});
