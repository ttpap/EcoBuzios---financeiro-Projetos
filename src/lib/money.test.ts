import { describe, it, expect } from "vitest";
import { parsePtBrMoneyToNumber, formatBRL } from "./money";

describe("parsePtBrMoneyToNumber", () => {
  it("parses pt-BR format with thousands separator", () => {
    expect(parsePtBrMoneyToNumber("1.234,56")).toBe(1234.56);
  });

  it("parses value with only comma decimal separator", () => {
    expect(parsePtBrMoneyToNumber("1234,56")).toBe(1234.56);
  });

  it("parses value with R$ currency symbol", () => {
    expect(parsePtBrMoneyToNumber("R$ 1.234,56")).toBe(1234.56);
  });

  it("parses US format (dot as decimal)", () => {
    expect(parsePtBrMoneyToNumber("1234.56")).toBe(1234.56);
  });

  it("returns 0 for zero string", () => {
    expect(parsePtBrMoneyToNumber("0")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parsePtBrMoneyToNumber("")).toBe(0);
  });

  it("returns 0 for invalid string", () => {
    expect(parsePtBrMoneyToNumber("abc")).toBe(0);
  });

  it("parses negative value", () => {
    expect(parsePtBrMoneyToNumber("-100,50")).toBe(-100.5);
  });

  it("parses million value", () => {
    expect(parsePtBrMoneyToNumber("1.000.000,00")).toBe(1000000);
  });

  it("parses integer value without decimals", () => {
    expect(parsePtBrMoneyToNumber("500")).toBe(500);
  });
});

describe("formatBRL", () => {
  it("formats positive value as BRL", () => {
    // Intl formatting — value should contain 1.234,56
    const result = formatBRL(1234.56);
    expect(result).toContain("1.234,56");
  });

  it("formats zero", () => {
    const result = formatBRL(0);
    expect(result).toContain("0,00");
  });
});
