/**
 * Plate normalization utilities.
 * Used to match loosely-typed plate strings (e.g. "FMF517", "FMF 517", "517")
 * against fully-formatted plates in the database (e.g. "06 FMF 517").
 */

/** Strip spaces, dashes and dots; uppercase. "06 FMF 517" → "06FMF517" */
export function normalizePlate(plate: string): string {
  return plate.replace(/[\s\-\.]/g, "").toUpperCase();
}

/**
 * Strip the optional Turkish city-code prefix (01-81) from a normalized plate.
 * "06FMF517" → "FMF517"
 */
function stripCityCode(normalized: string): string {
  return normalized.replace(/^\d{1,2}/, "");
}

/**
 * Try to find a vehicle whose plate matches the given note/text plate string.
 * Matching order (most to least specific):
 *   1. Exact normalized match:       "06FMF517" === "06FMF517"
 *   2. Without city code match:      "FMF517" === stripCityCode("06FMF517")
 *   3. DB plate ends with note:      "06FMF517".endsWith("FMF517")  (len ≥ 4)
 *   4. Note ends with DB no-city:    "FMF517".endsWith("FMF517")
 *
 * Returns the matched vehicle object or null.
 */
export function matchVehicleByPlate(
  notePlate: string,
  vehicles: {
    id: number;
    plate: string;
    driverName?: string | null;
    [k: string]: any;
  }[],
): {
  id: number;
  plate: string;
  driverName?: string | null;
  [k: string]: any;
} | null {
  const n = normalizePlate(notePlate);
  if (!n || n.length < 2) return null;
  const nNoCity = stripCityCode(n);

  for (const v of vehicles) {
    const vn = normalizePlate(v.plate);
    const vnNoCity = stripCityCode(vn);

    // 1. Exact
    if (vn === n) return v;
    // 2. Without city code
    if (vnNoCity === n || vn === nNoCity || vnNoCity === nNoCity) return v;
    // 3. DB plate ends with note (note is suffix of DB plate), min 4 chars to avoid "517" matching "06TK517"
    if (n.length >= 4 && vn.endsWith(n)) return v;
    if (nNoCity.length >= 4 && vnNoCity.endsWith(nNoCity)) return v;
    // 4. Note ends with DB no-city
    if (nNoCity.length >= 4 && n.endsWith(vnNoCity)) return v;
  }

  return null;
}

/** Extract the raw plate text from a task's notes field (e.g. "2CPT | Plaka: FMF517 " → "FMF517") */
export function extractPlateFromNotes(
  notes: string | null | undefined,
): string | null {
  if (!notes) return null;
  const match = notes.match(/Plaka:\s*([^|]+)/i);
  return match ? match[1].trim() : null;
}
