import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Upload,
  FileSpreadsheet,
  X,
  Check,
  ArrowRight,
  User,
} from "lucide-react";
import { useImportTasks, useCreateVehicle } from "@workspace/api-client-react";
import * as xlsx from "xlsx";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Try to extract Date (YYYY-MM-DD) from filename
function extractDateFromFilename(name: string): string | null {
  const baseName = name.substring(0, name.lastIndexOf(".")) || name;
  const clean = baseName.toLowerCase().trim();

  // 1. Try to find Turkish month names (e.g. "30 mayıs 2026", "30 mayis 2026", "3 haziran 2026")
  const turkishMonths = [
    "ocak",
    "şubat",
    "subat",
    "mart",
    "nisan",
    "mayıs",
    "mayis",
    "haziran",
    "temmuz",
    "ağustos",
    "agustos",
    "eylül",
    "eylul",
    "ekim",
    "kasım",
    "kasim",
    "aralık",
    "aralik",
  ];
  for (let i = 0; i < turkishMonths.length; i++) {
    const month = turkishMonths[i];
    const monthIdx = (i % 12) + 1; // Month number 1..12
    const regex = new RegExp(
      `\\b([1-9]|0[1-9]|[12]\\d|3[01])\\s+${month}\\s+(20\\d{2}|\\d{2})\\b`,
      "i",
    );
    const match = clean.match(regex);
    if (match) {
      const d = String(match[1]).padStart(2, "0");
      const m = String(monthIdx).padStart(2, "0");
      let y = match[2];
      if (y.length === 2) y = "20" + y;
      return `${y}-${m}-${d}`;
    }
  }

  // 2. Standard D.M.YYYY or D-M-YYYY or D_M_YYYY (e.g. "30.05.2026", "30.5.2026", "30-5-26", "3.5.26")
  const dmyMatch = clean.match(
    /\b([1-9]|0[1-9]|[12]\d|3[01])[-._]([1-9]|0[1-9]|1[0-2])[-._](20\d{2}|\d{2})\b/,
  );
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, "0");
    const m = String(dmyMatch[2]).padStart(2, "0");
    let y = dmyMatch[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${m}-${d}`;
  }

  // 3. YYYY.MM.DD or YYYY-MM-DD (e.g. "2026.05.30", "2026-05-30")
  const ymdMatch = clean.match(
    /\b(20\d{2})[-._]([1-9]|0[1-9]|1[0-2])[-._]([1-9]|0[1-9]|[12]\d|3[01])\b/,
  );
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(ymdMatch[2]).padStart(2, "0");
    const d = String(ymdMatch[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 4. Digits fallback (e.g. "30052026", "20260530")
  const digitsMatch1 = clean.match(
    /\b([1-9]|0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})\b/,
  );
  if (digitsMatch1) {
    const d = String(digitsMatch1[1]).padStart(2, "0");
    const m = String(digitsMatch1[2]).padStart(2, "0");
    const y = digitsMatch1[3];
    return `${y}-${m}-${d}`;
  }

  const digitsMatch2 = clean.match(
    /\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/,
  );
  if (digitsMatch2) {
    const y = digitsMatch2[1];
    const m = String(digitsMatch2[2]).padStart(2, "0");
    const d = String(digitsMatch2[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 5. 6-digit fallback (e.g. "010526")
  const digitsMatch3 = clean.match(
    /\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(\d{2})\b/,
  );
  if (digitsMatch3) {
    const d = String(digitsMatch3[1]).padStart(2, "0");
    const m = String(digitsMatch3[2]).padStart(2, "0");
    const y = "20" + digitsMatch3[3];
    return `${y}-${m}-${d}`;
  }

  return null;
}

// Excel serial time (0..1) → "HH:MM" string
function excelTimeToHHMM(serial: number): string {
  const totalMinutes = Math.round(serial * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Excel serial date+time or pure time → ISO datetime for base date with offset
function buildScheduledTime(
  rawVal: any,
  baseDateStr: string,
  dateOffset: number,
): string {
  const [y, m, d] = baseDateStr.split("-").map(Number);
  const baseDate = new Date(Date.UTC(y, m - 1, d));
  baseDate.setUTCDate(baseDate.getUTCDate() + dateOffset);
  const yyyy = baseDate.getUTCFullYear();
  const mm = String(baseDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(baseDate.getUTCDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  if (rawVal == null || rawVal === "") return `${dateStr}T00:00:00Z`;
  const num = Number(rawVal);
  if (!isNaN(num)) {
    // Excel stores time as fraction of day; dates > 1 have integer part
    const timeFraction = num % 1;
    const hhmm = excelTimeToHHMM(timeFraction);
    return `${dateStr}T${hhmm}:00Z`;
  }
  // String like "04:30"
  const str = String(rawVal).trim();
  if (/^\d{1,2}:\d{2}$/.test(str))
    return `${dateStr}T${str.padStart(5, "0")}:00Z`;
  return `${dateStr}T00:00:00Z`;
}

// Extract total minutes from Excel serial time or string "HH:MM"
function getTimeMinutes(rawVal: any): number | null {
  if (rawVal == null || rawVal === "") return null;
  const num = Number(rawVal);
  if (!isNaN(num)) {
    const timeFraction = num % 1;
    const totalMinutes = Math.round(timeFraction * 24 * 60);
    return totalMinutes % (24 * 60);
  }
  const str = String(rawVal).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return h * 60 + m;
  }
  return null;
}

// Parse passenger count from strings like "2CPT", "1KBN", "3CPT+1KBN", "1 CPT"
// Ignores numbers >= 10 to avoid parsing flight codes (e.g. 3001, 2189) or room numbers
function parsePassengerCount(text: any): number {
  if (!text) return 1;
  const s = String(text).replace(/\s/g, "");
  const nums = s.match(/\d+/g);
  if (!nums) return 1;
  const validNums = nums.map((n) => parseInt(n, 10)).filter((num) => num < 10);
  if (validNums.length === 0) return 1;
  return validNums.reduce((acc, n) => acc + n, 0);
}

// Check if value is system XML artifact or empty
function isValidValue(val: any): boolean {
  if (val == null) return false;
  const str = String(val).trim();
  if (str === "" || str === "System.Xml.XmlElement") return false;
  return true;
}

// Build task for first section (regular pages)
function buildRegularTask(
  row: any[],
  rowIndex: number,
  tableType: "left" | "right",
  baseDateStr: string,
  dateOffset: number,
): any | null {
  if (tableType === "left") {
    // Columns: A=S.NO, B=UÇUŞ KODU, C=PLAKA, D=ALINIŞ SAAT, E=OTEL ADI, F=EKİP SAYISI, G=KM
    const flightCode = String(row[1] || "").trim();
    const plate = String(row[2] || "").trim();
    const timeRaw = row[3];
    const hotelName = String(row[4] || "").trim();
    const ekip = String(row[5] || "").trim();
    const kmRaw = row[6];

    if (!isValidValue(row[4])) return null; // No hotel name → skip

    const isCancelled =
      plate.toUpperCase() === "İPTAL" || plate.toUpperCase() === "IPTAL";
    const scheduledTime = buildScheduledTime(timeRaw, baseDateStr, dateOffset);
    const importKey = `hotel_pickup|${scheduledTime}|${hotelName}|Esenboğa Havalimanı|left|r${rowIndex}`;

    return {
      type: "hotel_pickup",
      flightCode: flightCode || undefined,
      passengerCount: parsePassengerCount(ekip),
      pickupLocation: hotelName,
      dropoffLocation: "Esenboğa Havalimanı",
      scheduledTime,
      notes:
        [
          ekip ? ekip : null,
          isCancelled ? "İPTAL" : plate ? `Plaka: ${plate}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || undefined,
      km: kmRaw != null && !isNaN(Number(kmRaw)) ? Number(kmRaw) : undefined,
      rowIndex,
      tableType,
      importKey,
    };
  } else {
    // Columns: H=UÇUŞ KODU, I=PLAKA, J=ÖNÜ SAAT, K=OTEL ADI, L=EKİP SAYISI, M=KM
    const flightCode = String(row[7] || "").trim();
    const plate = String(row[8] || "").trim();
    const timeRaw = row[9];
    const hotelName = String(row[10] || "").trim();
    const ekip = String(row[11] || "").trim();
    const kmRaw = row[12];

    if (!isValidValue(row[10])) return null; // No hotel name → skip

    const isCancelled =
      plate.toUpperCase() === "İPTAL" || plate.toUpperCase() === "IPTAL";
    const scheduledTime = buildScheduledTime(timeRaw, baseDateStr, dateOffset);
    const importKey = `airport_run|${scheduledTime}|Esenboğa Havalimanı|${hotelName}|right|r${rowIndex}`;

    return {
      type: "airport_run",
      flightCode: flightCode || undefined,
      passengerCount: parsePassengerCount(ekip),
      pickupLocation: "Esenboğa Havalimanı",
      dropoffLocation: hotelName,
      scheduledTime,
      notes:
        [
          ekip ? ekip : null,
          isCancelled ? "İPTAL" : plate ? `Plaka: ${plate}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || undefined,
      km: kmRaw != null && !isNaN(Number(kmRaw)) ? Number(kmRaw) : undefined,
      rowIndex,
      tableType,
      importKey,
    };
  }
}

// Build task for second section (ekstra / page 2)
function buildEkstraTask(
  row: any[],
  rowIndex: number,
  tableType: "left" | "right",
  baseDateStr: string,
  dateOffset: number,
  isYellowRow = false,
): any | null {
  if (tableType === "left") {
    // Columns: A=S.NO, B=ALINIŞ SAAT, C=PLAKA, D=OTEL ADI / AÇIKLAMA
    const timeRaw = row[1];
    const plate = String(row[2] || "").trim();
    const desc = String(row[3] || "").trim();

    if (!isValidValue(row[3])) return null;

    const isCancelled =
      plate.toUpperCase() === "İPTAL" || plate.toUpperCase() === "IPTAL";
    const isTechnical =
      isYellowRow ||
      desc.toLowerCase().includes("teknik") ||
      desc.toLowerCase().includes("teknık") ||
      desc.toLowerCase().includes("teknk") ||
      desc.toLowerCase().includes("tekn.") ||
      desc.toLowerCase().includes("masraf") ||
      desc.toLowerCase().includes("msrf") ||
      desc.toLowerCase().includes("bakım") ||
      desc.toLowerCase().includes("arıza") ||
      desc.toLowerCase().includes("yakıt") ||
      desc.toLowerCase().includes("kod");

    const type = isTechnical ? "technical" : "extra";
    const dropoffLocation = isTechnical ? "Teknik Gider" : "Ekstra Gider";

    const scheduledTime = buildScheduledTime(timeRaw, baseDateStr, dateOffset);
    const importKey = `${type}|${scheduledTime}|${desc}|${dropoffLocation}|left|r${rowIndex}`;

    return {
      type,
      flightCode: undefined,
      passengerCount: parsePassengerCount(desc),
      pickupLocation: desc,
      dropoffLocation,
      scheduledTime,
      notes:
        [
          desc &&
          (desc.includes("CPT") ||
            desc.includes("KBN") ||
            desc.toLowerCase().includes("cpt") ||
            desc.toLowerCase().includes("kbn"))
            ? desc
            : null,
          isCancelled ? "İPTAL" : plate ? `Plaka: ${plate}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || undefined,
      rowIndex,
      tableType,
      importKey,
    };
  } else {
    // Columns: H=ÖNÜ SAAT, I=PLAKA, J=OTEL ADI / AÇIKLAMA
    const timeRaw = row[7];
    const plate = String(row[8] || "").trim();
    const desc = String(row[9] || "").trim();

    if (!isValidValue(row[9])) return null;

    const isCancelled =
      plate.toUpperCase() === "İPTAL" || plate.toUpperCase() === "IPTAL";
    const isTechnical =
      isYellowRow ||
      desc.toLowerCase().includes("teknik") ||
      desc.toLowerCase().includes("teknık") ||
      desc.toLowerCase().includes("teknk") ||
      desc.toLowerCase().includes("tekn.") ||
      desc.toLowerCase().includes("masraf") ||
      desc.toLowerCase().includes("msrf") ||
      desc.toLowerCase().includes("bakım") ||
      desc.toLowerCase().includes("arıza") ||
      desc.toLowerCase().includes("yakıt") ||
      desc.toLowerCase().includes("kod");

    const type = isTechnical ? "technical" : "extra";
    const dropoffLocation = isTechnical ? "Teknik Gelir" : "Ekstra Gelir";

    const scheduledTime = buildScheduledTime(timeRaw, baseDateStr, dateOffset);
    const importKey = `${type}|${scheduledTime}|${desc}|${dropoffLocation}|right|r${rowIndex}`;

    return {
      type,
      flightCode: undefined,
      passengerCount: parsePassengerCount(desc),
      pickupLocation: desc,
      dropoffLocation,
      scheduledTime,
      notes:
        [
          desc &&
          (desc.includes("CPT") ||
            desc.includes("KBN") ||
            desc.toLowerCase().includes("cpt") ||
            desc.toLowerCase().includes("kbn"))
            ? desc
            : null,
          isCancelled ? "İPTAL" : plate ? `Plaka: ${plate}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || undefined,
      rowIndex,
      tableType,
      importKey,
    };
  }
}

// Split task into 10-person chunks
function splitTask(task: any): any[] {
  if (!task) return [];
  if (task.passengerCount <= 10) return [task];

  const result: any[] = [];
  let remaining = task.passengerCount;
  let part = 1;

  while (remaining > 0) {
    const pCount = Math.min(remaining, 10);
    result.push({
      ...task,
      passengerCount: pCount,
      importKey: `${task.importKey}_part${part}`,
      notes: task.notes ? `${task.notes} (Bölüm ${part})` : `(Bölüm ${part})`,
    });
    remaining -= pCount;
    part++;
  }

  return result;
}

export function ImportTasks() {
  const queryClient = useQueryClient();
  const importMutation = useImportTasks();
  const createVehicleMutation = useCreateVehicle();

  const [importMode, setImportMode] = useState<"tasks" | "vehicles">("tasks");
  const [shiftDate, setShiftDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );
  const [parsedTasks, setParsedTasks] = useState<any[]>([]);
  const [parsedVehicles, setParsedVehicles] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [excelBase64, setExcelBase64] = useState<string | null>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isDatePromptOpen, setIsDatePromptOpen] = useState(false);

  const processFile = (file: File, targetDate: string) => {
    setUploadedFile(file);
    setFileName(file.name);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataUrl = evt.target?.result as string;
        const b64 = dataUrl.split(",")[1];
        setExcelBase64(b64);

        const workbook = xlsx.read(b64, { type: "base64", cellStyles: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = xlsx.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
        });

        // Build a map of which rows have a yellow background fill.
        // Yellow-background rows in the ekstra section are "technical" tasks.
        const rowIsYellow: boolean[] = new Array(rows.length).fill(false);
        try {
          const range = xlsx.utils.decode_range(sheet["!ref"] || "A1");
          const isYellow = (rgb: string) => {
            const up = rgb.toUpperCase();
            // FFFF00 (6-char) or FFFFFF00 (8-char ARGB with full alpha)
            return (
              up === "FFFF00" || up === "FFFFFF00" || up.endsWith("FFFF00")
            );
          };
          for (let r = range.s.r; r <= range.e.r; r++) {
            const arrIdx = r - range.s.r;
            if (arrIdx >= rows.length) break;
            for (let c = range.s.c; c <= Math.min(range.e.c, 13); c++) {
              const cell = sheet[xlsx.utils.encode_cell({ r, c })];
              if (!cell?.s) continue;
              const fg = String(cell.s.fgColor?.rgb ?? "");
              const bg = String(cell.s.bgColor?.rgb ?? "");
              if (isYellow(fg) || isYellow(bg)) {
                rowIsYellow[arrIdx] = true;
                break;
              }
            }
          }
        } catch (_) {
          /* Style reading unsupported — text-based detection only */
        }

        if (importMode === "tasks") {
          const tasks: any[] = [];
          let currentSection: "regular" | "ekstra" = "regular";

          let lastTimeMinutesLeft = -1;
          let dateOffsetLeft = 0;

          let lastTimeMinutesRight = -1;
          let dateOffsetRight = 0;

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every((c) => c == null || c === "")) continue;

            // ── Determine column A type ──────────────────────────────────────
            // Must do this FIRST. Section-header text detection must only run on
            // non-data rows. If a data row's hotel name or notes contain "ekstra",
            // the old code would prematurely switch sections — now it can't.
            const colAVal = row[0];
            const colAStr = colAVal != null ? String(colAVal).trim() : "";
            // A valid data row always has a positive integer in column A (S.NO).
            const colAIsNumeric =
              colAStr !== "" && !isNaN(Number(colAStr)) && Number(colAStr) >= 1;

            // ── Non-data row: section-header detection ───────────────────────
            if (!colAIsNumeric) {
              // Only examine header/separator rows for section keywords.
              // Using column-A text first (most reliable), then full row text.
              const colALower = colAStr.toLowerCase();
              const rowText = row
                .map((c) => String(c || ""))
                .join(" ")
                .toLowerCase();

              const isEkstraHeader =
                colALower.includes("ekstra") ||
                colALower.includes("ekst.") ||
                // Fallback: "EKSTRALAR" could be in another column on a header row
                (rowText.includes("ekstra") &&
                  // Confirm it's really a header: no valid regular-section columns
                  !isValidValue(row[1]) &&
                  !isValidValue(row[4]));

              if (isEkstraHeader && currentSection !== "ekstra") {
                currentSection = "ekstra";
                lastTimeMinutesLeft = -1;
                dateOffsetLeft = 0;
                lastTimeMinutesRight = -1;
                dateOffsetRight = 0;
                console.log(`excel import: section → ekstra (header row ${i})`);
              }
              // All non-data rows (headers, separators, totals) are skipped.
              continue;
            }

            // ── Data row: S.NO=1 ekstra heuristic ───────────────────────────
            // Detects the first data row of the ekstra section when there is no
            // explicit "EKSTRALAR" header row. Requires ALL THREE conditions so
            // that a regular row missing just one field doesn't false-trigger.
            if (colAStr === "1" && i > 10 && currentSection === "regular") {
              const noCrewInColF = !isValidValue(row[5]);
              const noFlightInColB = !isValidValue(row[1]);
              const noHotelInColE = !isValidValue(row[4]);
              const hasDescInColD = isValidValue(row[3]);

              // In the ekstra layout: B=time, C=plate, D=description, E=empty
              // In the regular layout: B=flight, C=plate, D=time, E=hotel, F=crew
              // So ekstra rows uniquely have: no flight (B), no hotel (E), has desc (D)
              if (
                noFlightInColB &&
                noHotelInColE &&
                hasDescInColD &&
                noCrewInColF
              ) {
                currentSection = "ekstra";
                lastTimeMinutesLeft = -1;
                dateOffsetLeft = 0;
                lastTimeMinutesRight = -1;
                dateOffsetRight = 0;
                console.log(
                  `excel import: section → ekstra (S.NO=1 heuristic row ${i})`,
                );
              }
            }

            if (currentSection === "regular") {
              const timeMinutesLeft = getTimeMinutes(row[3]);
              if (timeMinutesLeft !== null) {
                if (
                  lastTimeMinutesLeft !== -1 &&
                  timeMinutesLeft < lastTimeMinutesLeft
                ) {
                  dateOffsetLeft = 1;
                }
                lastTimeMinutesLeft = timeMinutesLeft;
              }

              const leftTask = buildRegularTask(
                row,
                i + 1,
                "left",
                targetDate,
                dateOffsetLeft,
              );
              if (leftTask) tasks.push(...splitTask(leftTask));

              const timeMinutesRight = getTimeMinutes(row[9]);
              if (timeMinutesRight !== null) {
                if (
                  lastTimeMinutesRight !== -1 &&
                  timeMinutesRight < lastTimeMinutesRight
                ) {
                  dateOffsetRight = 1;
                }
                lastTimeMinutesRight = timeMinutesRight;
              }

              const rightTask = buildRegularTask(
                row,
                i + 1,
                "right",
                targetDate,
                dateOffsetRight,
              );
              if (rightTask) tasks.push(...splitTask(rightTask));
            } else {
              const timeMinutesLeft = getTimeMinutes(row[1]);
              if (timeMinutesLeft !== null) {
                if (
                  lastTimeMinutesLeft !== -1 &&
                  timeMinutesLeft < lastTimeMinutesLeft
                ) {
                  dateOffsetLeft = 1;
                }
                lastTimeMinutesLeft = timeMinutesLeft;
              }

              const leftTask = buildEkstraTask(
                row,
                i + 1,
                "left",
                targetDate,
                dateOffsetLeft,
                rowIsYellow[i],
              );
              if (leftTask) tasks.push(...splitTask(leftTask));

              const timeMinutesRight = getTimeMinutes(row[7]);
              if (timeMinutesRight !== null) {
                if (
                  lastTimeMinutesRight !== -1 &&
                  timeMinutesRight < lastTimeMinutesRight
                ) {
                  dateOffsetRight = 1;
                }
                lastTimeMinutesRight = timeMinutesRight;
              }

              const rightTask = buildEkstraTask(
                row,
                i + 1,
                "right",
                targetDate,
                dateOffsetRight,
                rowIsYellow[i],
              );
              if (rightTask) tasks.push(...splitTask(rightTask));
            }
          }

          if (tasks.length === 0) {
            setParseError(
              "Dosyada işlenebilir görev bulunamadı. Sütun başlıklarını kontrol edin.",
            );
          }
          console.log("excel import: parsed targetDate:", targetDate);
          console.log("excel import: parsed tasks:", tasks);
          setParsedTasks(tasks);
        } else {
          // Parse vehicles (first 15 Crew vehicles + Esnaf/outsource vehicles + VARDIYA + MEMUR)
          const vehicles: any[] = [];
          let currentSection: "crew" | "esnaf" = "crew";

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;

            // Check if we hit the Esnaf section header
            const rowStr = row.map((c) => String(c || "")).join(" ");
            if (rowStr.includes("ESNAF ARAÇLARI")) {
              currentSection = "esnaf";
              continue;
            }

            if (currentSection === "crew") {
              const typeLabel = String(row[1] || "").trim();
              const basePlate = String(row[2] || "").trim();
              if (!basePlate || basePlate === "System.Xml.XmlElement") continue;

              if (typeLabel.includes("Ekip")) {
                const rawSno = row[0];
                if (rawSno == null) continue;
                const cleanSno = String(rawSno).replace(/\s/g, "");
                const sno = Number(cleanSno);

                // Only accept the first 15 crew/task vehicles (S.NO 1 to 15)
                if (!isNaN(sno) && sno >= 1 && sno <= 15) {
                  // Vardiya 1
                  const d1 = String(row[3] || "").trim();
                  const p1 = String(row[4] || "").trim();
                  if (isValidValue(row[3]) && d1 && d1 !== "null") {
                    vehicles.push({
                      name: `${typeLabel} (V1)`,
                      plate: `${basePlate} (V1)`,
                      type: "fixed",
                      driverName: d1,
                      phone: p1 || "Belirtilmedi",
                      capacity: 4,
                      notes: "Vardiya 1 Şoförü",
                    });
                  }

                  // Vardiya 2
                  const d2 = String(row[5] || "").trim();
                  const p2 = String(row[6] || "").trim();
                  if (isValidValue(row[5]) && d2 && d2 !== "null") {
                    vehicles.push({
                      name: `${typeLabel} (V2)`,
                      plate: `${basePlate} (V2)`,
                      type: "fixed",
                      driverName: d2,
                      phone: p2 || "Belirtilmedi",
                      capacity: 4,
                      notes: "Vardiya 2 Şoförü",
                    });
                  }

                  // Vardiya 3
                  const d3 = String(row[7] || "").trim();
                  const p3 = String(row[8] || "").trim();
                  if (isValidValue(row[7]) && d3 && d3 !== "null") {
                    vehicles.push({
                      name: `${typeLabel} (V3)`,
                      plate: `${basePlate} (V3)`,
                      type: "fixed",
                      driverName: d3,
                      phone: p3 || "Belirtilmedi",
                      capacity: 4,
                      notes: "Vardiya 3 Şoförü",
                    });
                  }
                }
              } else if (typeLabel === "VARDIYA") {
                // Vardiya 1
                const d1 = String(row[3] || "").trim();
                const p1 = String(row[4] || "").trim();
                if (
                  isValidValue(row[3]) &&
                  d1 &&
                  d1 !== "null" &&
                  !d1.includes("İZİNLİ")
                ) {
                  vehicles.push({
                    name: `Vardiya (${basePlate}) V1`,
                    plate: `${basePlate} (V1)`,
                    type: "fixed",
                    driverName: d1,
                    phone: p1 || "Belirtilmedi",
                    capacity: 4,
                    notes: "Vardiya Aracı - Vardiya 1",
                  });
                }

                // Vardiya 2
                const d2 = String(row[5] || "").trim();
                const p2 = String(row[6] || "").trim();
                if (
                  isValidValue(row[5]) &&
                  d2 &&
                  d2 !== "null" &&
                  !d2.includes("İZİNLİ")
                ) {
                  vehicles.push({
                    name: `Vardiya (${basePlate}) V2`,
                    plate: `${basePlate} (V2)`,
                    type: "fixed",
                    driverName: d2,
                    phone: p2 || "Belirtilmedi",
                    capacity: 4,
                    notes: "Vardiya Aracı - Vardiya 2",
                  });
                }
              } else if (typeLabel === "MEMUR") {
                const d1 = String(row[3] || "").trim();
                const p1 = String(row[4] || "").trim();
                const loc = String(row[5] || "").trim();
                if (isValidValue(row[3]) && d1 && d1 !== "null") {
                  vehicles.push({
                    name: `Memur (${basePlate})`,
                    plate: basePlate,
                    type: "fixed",
                    driverName: d1,
                    phone: p1 || "Belirtilmedi",
                    capacity: 4,
                    notes:
                      loc && loc !== "System.Xml.XmlElement"
                        ? `Memur Aracı - Semt: ${loc}`
                        : "Memur Aracı",
                  });
                }
              }
            } else if (currentSection === "esnaf") {
              const plate = String(row[2] || "").trim();
              const driver = String(row[3] || "").trim();
              const phone = String(row[4] || "").trim();
              const shift = String(row[5] || "").trim();

              // Valid plate should start with a number (e.g. 06 ...) and have some length
              if (
                plate &&
                /^\d/.test(plate) &&
                isValidValue(row[3]) &&
                driver &&
                driver !== "null"
              ) {
                vehicles.push({
                  name: `Esnaf (${plate})`,
                  plate: plate,
                  type: "outsource",
                  driverName: driver,
                  phone: phone || "Belirtilmedi",
                  capacity: 4,
                  notes: shift
                    ? `Esnaf Sefer Saatleri: ${shift}`
                    : "Esnaf Araç",
                });
              }
            }
          }

          if (vehicles.length === 0) {
            setParseError("Dosyada işlenebilir şoför/araç bilgisi bulunamadı.");
          }
          setParsedVehicles(vehicles);
        }
      } catch (err: any) {
        setParseError("Dosya okunurken hata: " + (err?.message || String(err)));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);

    if (importMode === "tasks") {
      const extracted = extractDateFromFilename(file.name);
      if (extracted) {
        setShiftDate(extracted);
        processFile(file, extracted);
      } else {
        setPendingFile(file);
        setIsDatePromptOpen(true);
      }
    } else {
      processFile(file, shiftDate);
    }
  };

  const handleConfirmTasks = () => {
    if (parsedTasks.length === 0) return;

    console.log(
      "excel import: confirming tasks. excelDate (shiftDate):",
      shiftDate,
    );
    console.log("excel import: tasks payload:", parsedTasks);

    importMutation.mutate(
      {
        data: {
          tasks: parsedTasks as any,
          excelBase64: excelBase64 ?? undefined,
          excelDate: shiftDate,
          excelFilename: fileName ?? "import.xlsx",
        },
      },
      {
        onSuccess: (result: any) => {
          const created = result?.created ?? parsedTasks.length;
          const updated = result?.updated ?? 0;
          alert(
            `İçe aktarma başarılı! ${created} yeni görev eklendi, ${updated} görev güncellendi.`,
          );
          window.dispatchEvent(new CustomEvent("excel-imported"));
          setParsedTasks([]);
          setFileName(null);
          setUploadedFile(null);
          setParseError(null);
          setExcelBase64(null);
        },
        onError: (err: any) => {
          alert("İçe aktarma hatası: " + (err?.message || "Bilinmeyen hata"));
        },
      },
    );
  };

  const handleConfirmVehicles = async () => {
    if (parsedVehicles.length === 0) return;
    setIsImporting(true);
    let successCount = 0;
    let failCount = 0;

    for (const v of parsedVehicles) {
      try {
        await createVehicleMutation.mutateAsync({ data: v });
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    alert(
      `Şoför ve araç aktarımı tamamlandı!\nBaşarılı: ${successCount}\nHatalı: ${failCount}`,
    );
    queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
    setParsedVehicles([]);
    setFileName(null);
    setUploadedFile(null);
    setParseError(null);
    setIsImporting(false);
  };

  const categories = {
    hotel_pickup: parsedTasks.filter((t) => t.type === "hotel_pickup"),
    airport_run: parsedTasks.filter((t) => t.type === "airport_run"),
    extra: parsedTasks.filter((t) => t.type === "extra"),
    technical: parsedTasks.filter((t) => t.type === "technical"),
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Veri İçe Aktar</h1>
          <p className="text-muted-foreground text-sm">
            Toplu görev veya araç/şoför yüklemek için Excel dosyası yükleyin
          </p>
        </div>

        {importMode === "tasks" && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              Vardiya Tarihi:
            </span>
            <input
              type="date"
              className="rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              value={shiftDate}
              onChange={(e) => {
                const newDate = e.target.value;
                setShiftDate(newDate);
                if (uploadedFile) {
                  processFile(uploadedFile, newDate);
                }
              }}
            />
          </div>
        )}

        <div className="flex bg-muted p-1 rounded-lg self-start shrink-0 border border-slate-100 dark:border-slate-800">
          <Button
            variant={importMode === "tasks" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setImportMode("tasks");
              setFileName(null);
              setUploadedFile(null);
              setParsedTasks([]);
              setParsedVehicles([]);
              setParseError(null);
            }}
          >
            Görevleri İçe Aktar
          </Button>
          <Button
            variant={importMode === "vehicles" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setImportMode("vehicles");
              setFileName(null);
              setUploadedFile(null);
              setParsedTasks([]);
              setParsedVehicles([]);
              setParseError(null);
            }}
          >
            Araç & Şoför İçe Aktar
          </Button>
        </div>
      </div>

      {!fileName ? (
        <Card className="p-12 border-dashed border-2 flex flex-col items-center justify-center text-center bg-muted/20 flex-1 max-h-[400px]">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
            <Upload size={24} />
          </div>
          <h3 className="font-semibold text-lg mb-1">Dosya Yükle</h3>
          <p className="text-sm text-muted-foreground mb-2">
            .xlsx dosyaları desteklenmektedir
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            {importMode === "tasks" ? (
              <span>
                Desteklenen formatlar:{" "}
                <span className="font-mono">
                  Normal Uçuş Seferleri & Ekstra Seferler (A-M Sütunları)
                </span>
              </span>
            ) : (
              <span>
                Desteklenen format:{" "}
                <span className="font-mono">
                  Şoför/Araç Vardiya Listesi (İlk 15 Ekip Aracı, 3 Vardiya)
                </span>
              </span>
            )}
          </p>
          <label className="cursor-pointer">
            <Button asChild>
              <span>Dosyalara Göz At</span>
            </Button>
            <input
              type="file"
              className="hidden"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
            />
          </label>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          <Card className="p-4 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between shrink-0">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="text-green-600" />
              <div>
                <div className="font-medium">{fileName}</div>
                {parseError ? (
                  <div className="text-sm text-red-500">{parseError}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {importMode === "tasks" ? (
                      <>
                        {parsedTasks.length} görev bulundu
                        <span className="ml-2 text-xs">
                          ({categories.hotel_pickup.length} otel alım ·{" "}
                          {categories.airport_run.length} havalimanı ·{" "}
                          {categories.extra.length} ekstra ·{" "}
                          {categories.technical.length} teknik)
                        </span>
                      </>
                    ) : (
                      <>
                        {parsedVehicles.length} şoför/vardiya kaydı bulundu (ilk
                        15 ekip aracı için)
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end w-full sm:w-auto gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFileName(null);
                  setUploadedFile(null);
                  setParsedTasks([]);
                  setParsedVehicles([]);
                  setParseError(null);
                }}
                disabled={isImporting}
              >
                <X className="w-4 h-4 mr-2" /> İptal
              </Button>
              {importMode === "tasks" ? (
                <Button
                  onClick={handleConfirmTasks}
                  disabled={
                    importMutation.isPending || parsedTasks.length === 0
                  }
                >
                  <Check className="w-4 h-4 mr-2" /> İçe Aktarmayı Onayla
                </Button>
              ) : (
                <Button
                  onClick={handleConfirmVehicles}
                  disabled={isImporting || parsedVehicles.length === 0}
                >
                  <Check className="w-4 h-4 mr-2" />
                  {isImporting ? "Aktarılıyor..." : "Şoförleri İçe Aktar"}
                </Button>
              )}
            </div>
          </Card>

          {importMode === "tasks" ? (
            <div className="grid grid-cols-4 gap-4 flex-1 overflow-hidden">
              <PreviewColumn
                title="Otel Alımları (→ Havalimanı)"
                tasks={categories.hotel_pickup}
              />
              <PreviewColumn
                title="Havalimanı Karşılamaları (→ Otel)"
                tasks={categories.airport_run}
              />
              <PreviewColumn title="Ekstralar" tasks={categories.extra} />
              <PreviewColumn
                title="Teknik İşler"
                tasks={categories.technical}
              />
            </div>
          ) : (
            <Card className="flex flex-col flex-1 overflow-hidden">
              <div className="p-3 border-b bg-muted/50">
                <h3 className="font-semibold text-sm">
                  Yüklenecek Araç ve Şoför Listesi
                </h3>
              </div>
              <div className="p-4 flex-1 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {parsedVehicles.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8 col-span-3">
                      Araç bulunamadı
                    </p>
                  )}
                  {parsedVehicles.map((v, i) => (
                    <div
                      key={i}
                      className="border rounded-lg p-3 bg-card shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-sm">{v.name}</h4>
                          <Badge
                            variant="outline"
                            className="text-xs bg-slate-50 dark:bg-slate-800"
                          >
                            {v.plate}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <User size={14} className="text-blue-500" />
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {v.driverName}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          Tel: <span className="font-mono">{v.phone}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t flex justify-between items-center text-[10px] text-muted-foreground">
                        <span>{v.notes}</span>
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1 py-0 capitalize"
                        >
                          {v.type === "fixed" ? "Sabit" : "Dış Servis"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Date Prompt Dialog */}
      <Dialog open={isDatePromptOpen} onOpenChange={setIsDatePromptOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Vardiya Tarihi Seçin</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Yüklediğiniz Excel dosyasının isminden vardiya tarihi otomatik
              olarak tespit edilemedi. Lütfen bu dosyadaki görevlerin hangi
              tarihe ait olduğunu seçin:
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tarih
              </label>
              <input
                type="date"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDatePromptOpen(false);
                  setPendingFile(null);
                  setFileName(null);
                  setUploadedFile(null);
                }}
              >
                İptal
              </Button>
              <Button
                onClick={() => {
                  if (pendingFile) {
                    setUploadedFile(pendingFile);
                    processFile(pendingFile, shiftDate);
                  }
                  setIsDatePromptOpen(false);
                }}
              >
                Devam Et
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewColumn({ title, tasks }: { title: string; tasks: any[] }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>
      <div className="p-3 flex-1 overflow-auto space-y-2">
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Görev yok
          </p>
        )}
        {tasks.map((t, i) => (
          <div key={i} className="text-sm border rounded p-2 bg-card">
            <div className="flex justify-between mb-1 gap-1">
              <span className="font-mono font-medium text-xs">
                {t.scheduledTime?.split("T")[1]?.substring(0, 5) ?? "--:--"}
              </span>
              {t.flightCode && (
                <Badge variant="outline" className="text-[10px]">
                  {t.flightCode}
                </Badge>
              )}
            </div>
            {t.type === "technical" ? (
              <div className="text-xs font-semibold bg-yellow-50/70 dark:bg-yellow-950/20 border border-solid border-yellow-300 rounded p-1.5 text-foreground/90 mt-1">
                <span className="text-[9px] text-yellow-600 dark:text-yellow-400 font-extrabold uppercase tracking-wider block mb-0.5">
                  Teknik İş Detayı
                </span>
                <span className="truncate block" title={t.pickupLocation}>
                  {t.pickupLocation}
                </span>
              </div>
            ) : t.type === "extra" ? (
              <div className="text-xs font-semibold bg-amber-50/50 dark:bg-amber-950/20 border border-dashed border-amber-300 rounded p-1.5 text-foreground/90 mt-1">
                <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block mb-0.5">
                  Ekstra İş Detayı
                </span>
                <span className="truncate block" title={t.pickupLocation}>
                  {t.pickupLocation}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground bg-slate-50 dark:bg-slate-800 p-1 rounded mt-1">
                <span className="truncate flex-1">{t.pickupLocation}</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span className="truncate flex-1 text-right">
                  {t.dropoffLocation}
                </span>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground mt-1">
              {t.passengerCount} kişi{t.notes ? ` · ${t.notes}` : ""}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
