import { describe, it, expect } from "vitest";
import { normalizePayMethod, formatDateBR } from "./reportBuilders";

describe("normalizePayMethod", () => {
  it("normalizes transferencia", () => {
    expect(normalizePayMethod("transferencia")).toBe("Transferência");
  });

  it("normalizes cheque", () => {
    expect(normalizePayMethod("cheque")).toBe("Cheque");
  });

  it("normalizes boleto", () => {
    expect(normalizePayMethod("boleto")).toBe("Boleto");
  });

  it("normalizes pix", () => {
    expect(normalizePayMethod("pix")).toBe("Pix");
  });

  it("returns dash for null", () => {
    expect(normalizePayMethod(null)).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(normalizePayMethod("")).toBe("-");
  });

  it("returns unknown value unchanged", () => {
    expect(normalizePayMethod("outro")).toBe("outro");
  });
});

describe("formatDateBR", () => {
  it("formats ISO date to dd/mm/yyyy", () => {
    expect(formatDateBR("2024-03-15")).toBe("15/03/2024");
  });

  it("formats date with zero-padded month and day", () => {
    expect(formatDateBR("2024-01-01")).toBe("01/01/2024");
  });

  it("returns empty string for null", () => {
    expect(formatDateBR(null)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatDateBR("")).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDateBR(undefined)).toBe("");
  });
});
