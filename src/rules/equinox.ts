/**
 * Approximation formula for Vernal Equinox Day and Autumnal Equinox Day.
 *
 * The formula commonly cited by the National Astronomical Observatory of Japan:
 *   day = floor(C + 0.242194 * (year - 1980) - floor((year - 1980) / 4))
 *
 * **Note: the leap-year correction division must use `floor`.** Implementing
 * it with `Math.trunc` shifts the result by a day for years before 1980
 * (where the dividend is negative). Cross-checking against the Cabinet
 * Office's official data (1955-2027, 146 vernal/autumnal dates in total)
 * shows that with `floor` division, a single coefficient reproduces every
 * date without splitting `C` by era. The commonly repeated claim that
 * "1900-1979 uses a different coefficient" most likely stems from this
 * difference in how the division is implemented.
 *
 * 1955-2027 has been verified against the official data. Earlier years
 * (1949-1954) have no way to be verified and rely purely on this formula's
 * extrapolation. The literature generally states this formula is valid for
 * 1980-2099, but the real-data verification above confirms it can safely
 * be extended back to at least 1955.
 */

const VERNAL_C = 20.8431;
const AUTUMNAL_C = 23.2488;

/** Integer division that floors correctly even for a negative dividend (the divisor is always positive). */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

function equinoxDay(year: number, c: number): number {
  return Math.floor(c + 0.242194 * (year - 1980) - floorDiv(year - 1980, 4));
}

export function vernalEquinoxDay(year: number): number {
  return equinoxDay(year, VERNAL_C);
}

export function autumnalEquinoxDay(year: number): number {
  return equinoxDay(year, AUTUMNAL_C);
}
