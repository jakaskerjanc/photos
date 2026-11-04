// Turns a photo's EXIF tags into the short texts the gallery shows: the date it was taken and a
// line of camera settings such as "Sony α6700 · 16mm · f/8 · 1/250 s · ISO 100". Location is never read.

export type PhotoTags = {
  DateTimeOriginal?: unknown;
  CreateDate?: unknown;
  Make?: unknown;
  Model?: unknown;
  FocalLength?: unknown;
  FNumber?: unknown;
  ExposureTime?: unknown;
  ISO?: unknown;
};

export type CaptureDate = { year: number; month: number; day: number };

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Cameras without a set clock write "0000:00:00".
function validDate(year: number, month: number, day: number): CaptureDate | undefined {
  const valid = [year, month, day].every(Number.isInteger) && year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
  return valid ? { year, month, day } : undefined;
}

// The camera's local date, as written on the photo. exiftool-vendored gives an ExifDateTime object,
// or the raw "YYYY:MM:DD hh:mm:ss" string when it can't parse the value.
export function captureDate(tags: PhotoTags): CaptureDate | undefined {
  for (const value of [tags.DateTimeOriginal, tags.CreateDate]) {
    if (typeof value === "object" && value !== null && "year" in value && "month" in value && "day" in value) {
      const { year, month, day } = value as CaptureDate;
      const date = validDate(year, month, day);
      if (date) return date;
    }
    if (typeof value === "string") {
      const match = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})/);
      const date = match && validDate(Number(match[1]), Number(match[2]), Number(match[3]));
      if (date) return date;
    }
  }
  return undefined;
}

export function formatDate({ year, month, day }: CaptureDate) {
  return `${day} ${monthNames[month - 1]} ${year}`;
}

// "6 Sep 2026", "5–17 Aug 2026", "19 May – 23 Sep 2026" or "28 Dec 2025 – 3 Jan 2026".
export function formatDateRange(dates: CaptureDate[]) {
  if (dates.length === 0) return undefined;
  const sorted = [...dates].sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (first.year !== last.year) return `${formatDate(first)} – ${formatDate(last)}`;
  if (first.month !== last.month) {
    return `${first.day} ${monthNames[first.month - 1]} – ${last.day} ${monthNames[last.month - 1]} ${last.year}`;
  }
  if (first.day !== last.day) return `${first.day}–${last.day} ${monthNames[last.month - 1]} ${last.year}`;
  return formatDate(first);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Makers write their names in capitals ("SONY", "NIKON CORPORATION"); short ones like "DJI" are acronyms.
function brandName(make: string) {
  const brand = make.split(/\s+/)[0];
  return brand.length > 3 && brand === brand.toUpperCase() ? brand[0] + brand.slice(1).toLowerCase() : brand;
}

export function cameraName(make: unknown, model: unknown) {
  const makeText = text(make);
  let modelText = text(model);
  if (!modelText) return makeText && brandName(makeText);

  // Sony names its mirrorless bodies "ILCE-6700" in EXIF but sells them as the α6700.
  const sonyAlpha = modelText.match(/^ILCE-(\w+)$/);
  if (sonyAlpha) return `Sony α${sonyAlpha[1]}`;
  if (!makeText) return modelText;

  const brand = brandName(makeText);
  if (modelText.toLowerCase().startsWith(brand.toLowerCase())) {
    modelText = modelText.slice(brand.length).trim();
  }
  return `${brand} ${modelText}`;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function trimmed(value: number) {
  return String(Math.round(value * 10) / 10);
}

function shutterSpeed(value: unknown) {
  if (typeof value === "string" && /^1\/\d+$/.test(value.trim())) return `${value.trim()} s`;
  const seconds = number(value);
  if (seconds === undefined) return undefined;
  const denominator = Math.round(1 / seconds);
  if (seconds < 1 && denominator > 1 && Math.abs(1 / seconds - denominator) < 0.05) return `1/${denominator} s`;
  return `${trimmed(seconds)} s`;
}

export function exposureDetails(tags: PhotoTags) {
  const focalLength = number(tags.FocalLength);
  const aperture = number(tags.FNumber);
  const iso = number(tags.ISO);
  const parts = [
    cameraName(tags.Make, tags.Model),
    focalLength && `${trimmed(focalLength)}mm`,
    aperture && `f/${trimmed(aperture)}`,
    shutterSpeed(tags.ExposureTime),
    iso && `ISO ${Math.round(iso)}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
