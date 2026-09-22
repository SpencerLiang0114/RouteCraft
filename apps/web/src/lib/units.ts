const MI_PER_KM = 0.621371;
const FT_PER_M = 3.28084;

export function kmToMi(km: number) {
  return km * MI_PER_KM;
}

export function mToFt(m: number) {
  return m * FT_PER_M;
}

function trimDecimals(value: number, digits: number) {
  return Number(value.toFixed(digits)).toString();
}

/** "5.2 mi" — one decimal under 100 mi, whole miles above. */
export function formatMiles(km: number) {
  const mi = kmToMi(km);
  return `${trimDecimals(mi, Math.abs(mi) < 100 ? 1 : 0)} mi`;
}

/** "394 ft" — rounded to the nearest foot. */
export function formatFeet(m: number) {
  return `${Math.round(mToFt(m))} ft`;
}

/** "8.4 km (5.2 mi)" */
export function formatDistance(km: number) {
  return `${km} km (${formatMiles(km)})`;
}

/** "120 m (394 ft)"; pass signed to prefix positive values with "+". */
export function formatElevation(m: number, { signed = false }: { signed?: boolean } = {}) {
  const sign = signed && m > 0 ? "+" : "";
  return `${sign}${m} m (${sign}${formatFeet(m)})`;
}
