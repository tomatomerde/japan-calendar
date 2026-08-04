import { describe, expect, it } from 'vitest';
import { OFFICIAL_META } from '../src/data/official.ts';
import { OutOfRangeError } from '../src/errors.ts';
import { holidaysForYear, isHoliday, statutoryHolidaysForYear } from '../src/holidays.ts';

describe('isHoliday — 2019年GW10連休', () => {
  it('4/27〜5/6の内訳が正しい', () => {
    expect(isHoliday('2019-04-27')).toBeNull(); // 土曜
    expect(isHoliday('2019-04-28')).toBeNull(); // 日曜
    expect(isHoliday('2019-04-29')).toMatchObject({ name: '昭和の日', category: 'statutory' });
    expect(isHoliday('2019-04-30')).toMatchObject({ name: '国民の休日', category: 'bridge' });
    expect(isHoliday('2019-05-01')).toMatchObject({ name: '天皇の即位の日', category: 'statutory' });
    expect(isHoliday('2019-05-02')).toMatchObject({ name: '国民の休日', category: 'bridge' });
    expect(isHoliday('2019-05-03')).toMatchObject({ name: '憲法記念日', category: 'statutory' });
    expect(isHoliday('2019-05-04')).toMatchObject({ name: 'みどりの日', category: 'statutory' });
    expect(isHoliday('2019-05-05')).toMatchObject({ name: 'こどもの日', category: 'statutory' });
    expect(isHoliday('2019-05-06')).toMatchObject({ name: '振替休日', category: 'substitute' }); // 5/5が日曜
  });

  it('即位礼正殿の儀（10/22）', () => {
    expect(isHoliday('2019-10-22')).toMatchObject({ name: '即位礼正殿の儀', category: 'statutory' });
  });
});

describe('isHoliday — 五輪特措法による移動', () => {
  it('2020年: 海の日7/23・スポーツの日7/24・山の日8/10', () => {
    expect(isHoliday('2020-07-23')).toMatchObject({ name: '海の日' });
    expect(isHoliday('2020-07-24')).toMatchObject({ name: 'スポーツの日' });
    expect(isHoliday('2020-08-10')).toMatchObject({ name: '山の日' });
    // 通常の日付は祝日ではない
    expect(isHoliday('2020-07-20')).toBeNull();
    expect(isHoliday('2020-10-12')).toBeNull(); // 通常のスポーツの日(第2月曜)の日付
  });

  it('2021年: 海の日7/22・スポーツの日7/23・山の日8/8、8/9は振替休日', () => {
    expect(isHoliday('2021-07-22')).toMatchObject({ name: '海の日' });
    expect(isHoliday('2021-07-23')).toMatchObject({ name: 'スポーツの日' });
    expect(isHoliday('2021-08-08')).toMatchObject({ name: '山の日' });
    expect(isHoliday('2021-08-09')).toMatchObject({ name: '振替休日', category: 'substitute' });
  });

  it('2022年以降は通常運用に戻る', () => {
    expect(isHoliday('2022-07-18')).toMatchObject({ name: '海の日' });
    expect(isHoliday('2022-08-11')).toMatchObject({ name: '山の日' });
    expect(isHoliday('2022-10-10')).toMatchObject({ name: 'スポーツの日' });
  });
});

describe('isHoliday — 国民の休日 2026-09-22', () => {
  it('敬老の日と秋分の日に挟まれて国民の休日になる', () => {
    expect(isHoliday('2026-09-21')).toMatchObject({ name: '敬老の日', category: 'statutory' });
    expect(isHoliday('2026-09-22')).toMatchObject({ name: '国民の休日', category: 'bridge' });
    expect(isHoliday('2026-09-23')).toMatchObject({ name: '秋分の日', category: 'statutory' });
  });

  it('公式データの確定境界年以内であれば confirmed: true', () => {
    // OFFICIAL_META.equinoxConfirmedThrough は実データから機械的に算出される値
    // （本稿執筆時点では2027）。2026年はその範囲内なので確定済み。
    expect(isHoliday('2026-09-23')?.confirmed).toBe(true);
    expect(isHoliday('2026-09-22')?.confirmed).toBe(true);
  });

  it('確定境界年より後は暫定値（confirmed: false）で、国民の休日もそれを継承する', () => {
    const boundary = OFFICIAL_META.equinoxConfirmedThrough as number;
    const futureYear = boundary + 1;
    const equinox = holidaysForYear(futureYear).find((h) => h.name === '秋分の日');
    expect(equinox?.confirmed).toBe(false);
  });
});

describe('isHoliday — 振替休日', () => {
  it('日曜と重なった祝日の翌日が振替休日になる', () => {
    expect(isHoliday('1973-04-29')).toMatchObject({ name: '天皇誕生日' });
    expect(isHoliday('1973-04-30')).toMatchObject({ name: '振替休日' });
  });

  it('1973-04-12より前は振替休日が発生しない', () => {
    // 1972年、5/5こどもの日相当日の前後で日曜重複があっても振替が無いことを、
    // 制度開始前年の統計的性質として確認する（1955〜1972年に振替休日が0件）。
    for (let year = 1955; year <= 1972; year += 1) {
      const holidays = statutoryHolidaysForYear(year);
      expect(holidays.every((h) => h.category !== 'substitute')).toBe(true);
    }
  });

  it('2007年改正: 翌日以降が祝日なら最初の非祝日まで振替が連鎖する', () => {
    // 2026-05-03(日) 憲法記念日 → 5/4,5/5は既に祝日 → 振替休日は5/6
    expect(isHoliday('2026-05-03')).toMatchObject({ name: '憲法記念日' });
    expect(isHoliday('2026-05-04')).toMatchObject({ name: 'みどりの日' });
    expect(isHoliday('2026-05-05')).toMatchObject({ name: 'こどもの日' });
    expect(isHoliday('2026-05-06')).toMatchObject({ name: '振替休日', category: 'substitute' });
  });
});

describe('isHoliday — 対応範囲', () => {
  it('範囲外の年はエラーを投げる', () => {
    expect(() => isHoliday('1948-12-31')).toThrow(OutOfRangeError);
    expect(() => isHoliday('2100-01-01')).toThrow(OutOfRangeError);
  });

  it('対応範囲の境界年は例外を投げない', () => {
    expect(() => isHoliday('1949-01-01')).not.toThrow();
    expect(() => isHoliday('2099-12-31')).not.toThrow();
  });
});

describe('isHoliday — 平日は null', () => {
  it('通常の平日は祝日ではない', () => {
    expect(isHoliday('2026-08-04')).toBeNull();
  });
});

describe('1949-1954年 — 公式データの範囲外で、突き合わせ検証が効かない唯一の期間', () => {
  // 内閣府CSVは1955年から。この6年ぶんはルールエンジンの出力を照合する
  // 相手が存在せず、officialMatch.test.ts の守備範囲外になる。実際、
  // ここを固定するテストが無かったころは「元日を1949-54年から丸ごと
  // 削除する」変異を入れても全テストが通ってしまっていた。
  //
  // 照合先が無い以上、期待値は法律から起こす。祝日法（昭和23年法律第178号、
  // 1949年施行）が定めた祝日は次の9つで、この期間中の改正は無い
  // （建国記念の日=1967, 敬老の日・体育の日=1966, 海の日=1996,
  //  山の日=2016 はいずれも後年）。
  const NINE_ORIGINAL_HOLIDAYS = [
    '元日',
    '成人の日',
    '春分の日',
    '天皇誕生日',
    '憲法記念日',
    'こどもの日',
    '秋分の日',
    '文化の日',
    '勤労感謝の日',
  ];

  it('1949-1954年の法定祝日はちょうど祝日法制定時の9つ', () => {
    for (let year = 1949; year <= 1954; year += 1) {
      const names = statutoryHolidaysForYear(year).map((h) => h.name);
      expect(names, String(year)).toEqual(NINE_ORIGINAL_HOLIDAYS);
    }
  });

  it('固定日の祝日は法律どおりの月日にある', () => {
    for (let year = 1949; year <= 1954; year += 1) {
      const byName = new Map(statutoryHolidaysForYear(year).map((h) => [h.name, h.date]));
      expect(byName.get('元日'), String(year)).toMatchObject({ month: 1, day: 1 });
      expect(byName.get('成人の日'), String(year)).toMatchObject({ month: 1, day: 15 });
      expect(byName.get('天皇誕生日'), String(year)).toMatchObject({ month: 4, day: 29 });
      expect(byName.get('憲法記念日'), String(year)).toMatchObject({ month: 5, day: 3 });
      expect(byName.get('こどもの日'), String(year)).toMatchObject({ month: 5, day: 5 });
      expect(byName.get('文化の日'), String(year)).toMatchObject({ month: 11, day: 3 });
      expect(byName.get('勤労感謝の日'), String(year)).toMatchObject({ month: 11, day: 23 });
    }
  });

  it('振替休日も国民の休日も発生しない（制度開始は1973年/1985年）', () => {
    for (let year = 1949; year <= 1954; year += 1) {
      const derived = holidaysForYear(year).filter((h) => h.category !== 'statutory');
      expect(derived, String(year)).toEqual([]);
    }
  });

  it('春分/秋分は近似式によるもので confirmed=false（公式データの範囲外なので）', () => {
    for (let year = 1949; year <= 1954; year += 1) {
      for (const holiday of statutoryHolidaysForYear(year)) {
        const expected = holiday.name === '春分の日' || holiday.name === '秋分の日' ? false : true;
        expect(holiday.confirmed, `${year} ${holiday.name}`).toBe(expected);
      }
    }
  });
});
