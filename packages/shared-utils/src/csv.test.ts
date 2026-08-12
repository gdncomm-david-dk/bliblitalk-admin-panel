import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes every field and doubles embedded quotes", () => {
    expect(toCsv(["A", "B"], [["plain", 'has "quotes"']])).toBe('"A","B"\r\n"plain","has ""quotes"""');
  });

  it("keeps a comma inside its own field", () => {
    expect(toCsv(["A"], [["Jakarta, Indonesia"]])).toBe('"A"\r\n"Jakarta, Indonesia"');
  });

  it("renders null, undefined and numbers without throwing", () => {
    expect(toCsv(["A", "B", "C"], [[null, undefined, 7]])).toBe('"A","B","C"\r\n"","","7"');
  });

  // The reason this module exists. Quoting alone does not stop a spreadsheet evaluating a
  // cell, because the parser strips the quotes first — so these assert the tab prefix that
  // forces a text cell, for each character Excel/Sheets treat as a formula opener.
  it.each(["=", "+", "-", "@"])("neutralises a leading %s", (prefix) => {
    const payload = `${prefix}HYPERLINK("https://evil.example.com","Click")`;
    expect(toCsv(["Name"], [[payload]])).toBe(`"Name"\r\n"\t${payload.replace(/"/g, '""')}"`);
  });

  it("neutralises a leading tab and carriage return too", () => {
    expect(toCsv(["Name"], [["\t=1+1"]])).toBe('"Name"\r\n"\t\t=1+1"');
    expect(toCsv(["Name"], [["\r=1+1"]])).toBe('"Name"\r\n"\t\r=1+1"');
  });

  it("leaves a formula character alone when it is not leading", () => {
    expect(toCsv(["Name"], [["Rp1.000 - 2.000"]])).toBe('"Name"\r\n"Rp1.000 - 2.000"');
  });

  it("strips control characters that could confuse a parser", () => {
    // Built with fromCharCode rather than pasted, so the byte survives editors and diffs.
    const withControlChar = `Ali${String.fromCharCode(1)}ce`;
    expect(toCsv(["Name"], [[withControlChar]])).toBe('"Name"\r\n"Alice"');
  });

  it("emits only a header row when there are no rows", () => {
    expect(toCsv(["A", "B"], [])).toBe('"A","B"');
  });
});
