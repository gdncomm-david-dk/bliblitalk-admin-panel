/**
 * Excel, LibreOffice Calc and Google Sheets evaluate a cell whose *parsed* value starts
 * with `=`, `+`, `-`, `@`, tab or carriage return. CSV quoting does not prevent that — the
 * parser strips the quotes before the spreadsheet looks at the value — so the two exports
 * in this app were correctly quoted and still injectable. Prefixing with a tab keeps the
 * value readable while forcing a text cell.
 *
 * The payload source is anonymous: `User.name`, `institution`, `position` and `phone` are
 * written by the public portal's unauthenticated registration, and land in an internal
 * administrator's spreadsheet when they click Export. See docs/REMEDIATION.md SEC-026.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value;
}

/**
 * Strips control characters, which have no legitimate place in an exported profile field and
 * are a second way to confuse a parser. Tab, newline and carriage return are kept: they are
 * legal inside a quoted CSV field, and the two that can open a formula are handled above.
 *
 * Written as a code-point filter rather than a `[\x00-\x1F]` regex on purpose — the regex form
 * trips `no-control-regex`, and silencing that rule inside the function that exists to sanitise
 * output is the wrong trade.
 */
function stripControlChars(value: string): string {
  return [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 || code === 9 || code === 10 || code === 13;
    })
    .join("");
}

function escapeField(value: unknown): string {
  const s = stripControlChars(String(value ?? ""));
  return `"${neutralizeFormula(s).replace(/"/g, '""')}"`;
}

/**
 * Builds a CSV document with every field quoted and formula-neutralised.
 *
 * One implementation shared by every export on purpose — the defect it fixes existed
 * because two pages each wrote their own near-identical escaper, and a third would have
 * done the same. `\r\n` is the line ending RFC 4180 specifies and the one Excel expects.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((row) => row.map(escapeField).join(",")).join("\r\n");
}
