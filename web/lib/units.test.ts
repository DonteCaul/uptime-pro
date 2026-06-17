import { describe, expect, it } from "vitest";
import { alt, speed, temp, gpsSpeed } from "./units";

describe("units", () => {
  describe("alt", () => {
    it("returns an em-dash for null", () => {
      expect(alt(null, "metric")).toBe("—");
      expect(alt(null, "imperial")).toBe("—");
    });

    it("formats meters in metric mode", () => {
      expect(alt(4000, "metric")).toBe("4,000 m");
    });

    it("converts to feet in imperial-mode", () => {
      expect(alt(4000, "imperial")).toBe("13,124 ft");
    });
  });

  describe("speed", () => {
    it("returns an em-dash for null", () => {
      expect(speed(null, "metric")).toBe("—");
    });

    it("formats m/s in metric mode", () => {
      expect(speed(56.2, "metric")).toBe("56.2 m/s");
    });

    it("converts to mph in imperial mode", () => {
      // 56.2 m/s × 2.237 = 125.7194 → "125.7 mph"
      expect(speed(56.2, "imperial")).toBe("125.7 mph");
    });
  });

  describe("temp", () => {
    it("returns an em-dash for null", () => {
      expect(temp(null, "metric")).toBe("—");
    });

    it("formats celsius in metric mode", () => {
      expect(temp(20, "metric")).toBe("20.0°C");
    });

    it("converts to fahrenheit in imperial mode", () => {
      expect(temp(20, "imperial")).toBe("68.0°F");
    });
  });

  describe("gpsSpeed", () => {
    it("returns an em-dash for null", () => {
      expect(gpsSpeed(null, "metric")).toBe("—");
    });

    it("converts knots to km/h in metric mode", () => {
      expect(gpsSpeed(100, "metric")).toBe("185.2 km/h");
    });

    it("converts knots to mph in imperial mode", () => {
      expect(gpsSpeed(100, "imperial")).toBe("115 mph");
    });
  });
});
