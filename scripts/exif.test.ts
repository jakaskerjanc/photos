import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExifDateTime } from "exiftool-vendored";
import { cameraName, captureDate, exposureDetails, formatDateRange } from "./exif";

describe("captureDate", () => {
  it("reads the camera's local date from DateTimeOriginal", () => {
    const value = ExifDateTime.fromEXIF("2026:08:06 23:39:07.375+02:00");
    assert.deepEqual(captureDate({ DateTimeOriginal: value }), { year: 2026, month: 8, day: 6 });
  });

  it("falls back to CreateDate and to unparsed strings", () => {
    assert.deepEqual(captureDate({ CreateDate: "2026:05:19 05:35:22" }), { year: 2026, month: 5, day: 19 });
  });

  it("returns nothing without a date", () => {
    assert.equal(captureDate({}), undefined);
    assert.equal(captureDate({ DateTimeOriginal: "0000:00:00 00:00:00" }), undefined);
  });
});

describe("formatDateRange", () => {
  const date = (year: number, month: number, day: number) => ({ year, month, day });

  it("shows a single day", () => {
    assert.equal(formatDateRange([date(2026, 9, 6), date(2026, 9, 6)]), "6 Sep 2026");
  });

  it("shares the month and year within a month", () => {
    assert.equal(formatDateRange([date(2026, 8, 17), date(2026, 8, 5), date(2026, 8, 11)]), "5–17 Aug 2026");
  });

  it("shares the year across months", () => {
    assert.equal(formatDateRange([date(2026, 9, 23), date(2026, 5, 19)]), "19 May – 23 Sep 2026");
  });

  it("writes both years across a new year", () => {
    assert.equal(formatDateRange([date(2026, 1, 3), date(2025, 12, 28)]), "28 Dec 2025 – 3 Jan 2026");
  });

  it("returns nothing without dates", () => {
    assert.equal(formatDateRange([]), undefined);
  });
});

describe("cameraName", () => {
  it("uses Sony's product names for ILCE bodies", () => {
    assert.equal(cameraName("SONY", "ILCE-6700"), "Sony α6700");
    assert.equal(cameraName("SONY", "ILCE-7RM5"), "Sony α7RM5");
  });

  it("writes the brand once, in normal case", () => {
    assert.equal(cameraName("NIKON CORPORATION", "NIKON D3300"), "Nikon D3300");
    assert.equal(cameraName("Canon", "Canon EOS R5"), "Canon EOS R5");
    assert.equal(cameraName("FUJIFILM", "X-T5"), "Fujifilm X-T5");
    assert.equal(cameraName("Apple", "iPhone 15 Pro"), "Apple iPhone 15 Pro");
    assert.equal(cameraName("DJI", "FC3582"), "DJI FC3582");
  });

  it("copes with a missing make or model", () => {
    assert.equal(cameraName(undefined, "X100V"), "X100V");
    assert.equal(cameraName("SONY", undefined), "Sony");
    assert.equal(cameraName(undefined, undefined), undefined);
  });
});

describe("exposureDetails", () => {
  it("joins camera, focal length, aperture, shutter speed and ISO", () => {
    assert.equal(
      exposureDetails({ Make: "SONY", Model: "ILCE-6700", FocalLength: "16.0 mm", FNumber: 22, ExposureTime: 0.3, ISO: 100 }),
      "Sony α6700 · 16mm · f/22 · 0.3 s · ISO 100",
    );
  });

  it("writes fast shutter speeds as fractions", () => {
    assert.equal(exposureDetails({ ExposureTime: "1/1250" }), "1/1250 s");
    assert.equal(exposureDetails({ ExposureTime: 0.004 }), "1/250 s");
    assert.equal(exposureDetails({ ExposureTime: 2 }), "2 s");
  });

  it("keeps fractional focal lengths and apertures", () => {
    assert.equal(exposureDetails({ FocalLength: "4.3 mm", FNumber: 5.6 }), "4.3mm · f/5.6");
  });

  it("skips what's missing and returns nothing for photos without EXIF", () => {
    assert.equal(exposureDetails({ FNumber: 8 }), "f/8");
    assert.equal(exposureDetails({}), undefined);
  });
});
