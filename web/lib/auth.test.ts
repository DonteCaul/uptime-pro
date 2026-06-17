import { describe, expect, it } from "vitest";
import { validateEmail, validatePassword, validateName } from "./auth";

describe("validateEmail", () => {
  it("rejects empty input", () => {
    expect(validateEmail("")).toBe("Email is required");
    expect(validateEmail("   ")).toBe("Email is required");
  });

  it("rejects malformed addresses", () => {
    expect(validateEmail("notanemail")).toBe("Enter a valid email address");
    expect(validateEmail("missing@domain")).toBe("Enter a valid email address");
    expect(validateEmail("@nodomain.com")).toBe("Enter a valid email address");
    expect(validateEmail("spaces in@email.com")).toBe(
      "Enter a valid email address",
    );
  });

  it("accepts well-formed addresses", () => {
    expect(validateEmail("user@example.com")).toBeNull();
    expect(validateEmail("first.last+tag@sub.example.org")).toBeNull();
  });
});

describe("validatePassword", () => {
  it("rejects empty input", () => {
    expect(validatePassword("")).toBe("Password is required");
  });

  it("enforces 8-character minimum", () => {
    expect(validatePassword("short")).toBe(
      "Password must be at least 8 characters",
    );
    expect(validatePassword("1234567")).toBe(
      "Password must be at least 8 characters",
    );
  });

  it("accepts 8+ characters", () => {
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("a-long-secure-passphrase")).toBeNull();
  });
});

describe("validateName", () => {
  it("rejects empty input", () => {
    expect(validateName("")).toBe("Name is required");
    expect(validateName("   ")).toBe("Name is required");
  });

  it("rejects single-character names", () => {
    expect(validateName("A")).toBe("Name is too short");
  });

  it("accepts valid names", () => {
    expect(validateName("Jane")).toBeNull();
    expect(validateName("Donte Caul")).toBeNull();
  });
});
