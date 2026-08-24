import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml } from "./emailHtml";

/**
 * SEC-015: marketing and reminder bodies are raw HTML typed by an admin and sent straight to
 * participants. These tests pin both halves of the allowlist — that dangerous markup is
 * removed, and that the ordinary formatting an admin actually writes survives untouched.
 */
describe("sanitizeEmailHtml", () => {
  describe("strips what must never reach a recipient", () => {
    it("removes a script tag and its body, not just the tag", () => {
      const out = sanitizeEmailHtml('<p>Hi</p><script>alert("x")</script>');
      expect(out).toBe("<p>Hi</p>");
      // The payload text itself is gone. Dropping only the tags would leave `alert("x")`
      // sitting in the message as visible junk.
      expect(out).not.toContain("alert");
    });

    it("removes inline event handlers", () => {
      const out = sanitizeEmailHtml('<p onclick="steal()">Click</p>');
      expect(out).toBe("<p>Click</p>");
      expect(out).not.toContain("onclick");
    });

    it("drops a javascript: link but keeps the text", () => {
      const out = sanitizeEmailHtml('<a href="javascript:alert(1)">Register</a>');
      expect(out).not.toContain("javascript:");
      expect(out).toContain("Register");
    });

    it("drops a data: URI image", () => {
      const out = sanitizeEmailHtml('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="x">');
      expect(out).not.toContain("data:");
    });

    it("refuses a protocol-relative href, matching the SafeUrl rule on stored URLs", () => {
      const out = sanitizeEmailHtml('<a href="//evil.example/phish">Confirm</a>');
      expect(out).not.toContain("evil.example");
    });

    it("removes iframes, objects and forms", () => {
      const out = sanitizeEmailHtml(
        '<iframe src="https://evil.example"></iframe>' +
          '<object data="x.swf"></object>' +
          '<form action="https://evil.example"><input name="pw"></form>',
      );
      expect(out).not.toContain("<iframe");
      expect(out).not.toContain("<object");
      expect(out).not.toContain("<form");
      expect(out).not.toContain("<input");
    });

    it("strips a style property that is not on the allowlist", () => {
      const out = sanitizeEmailHtml('<p style="color: red; position: fixed">Hi</p>');
      expect(out).toContain("color");
      expect(out).not.toContain("position");
    });
  });

  describe("keeps what a real campaign is made of", () => {
    it("passes ordinary formatting through unchanged", () => {
      const html =
        "<p>Hi <strong>there</strong>,</p>" +
        "<p>Join us for <em>Blibli Talk</em>.</p>" +
        "<ul><li>Free entry</li><li>Certificate provided</li></ul>";
      expect(sanitizeEmailHtml(html)).toBe(html);
    });

    it("keeps https links with their target and rel", () => {
      const html = '<a href="https://blibli.com/events" target="_blank" rel="noopener">Register</a>';
      expect(sanitizeEmailHtml(html)).toBe(html);
    });

    it("keeps a mailto link, which every campaign footer has", () => {
      const html = '<a href="mailto:recruitment@blibli.com">Contact us</a>';
      expect(sanitizeEmailHtml(html)).toBe(html);
    });

    it("keeps layout tables with the attributes mail clients need", () => {
      const html =
        '<table width="600" align="center" cellpadding="0" cellspacing="0" bgcolor="#ffffff">' +
        '<tr><td align="center" valign="top">Body</td></tr></table>';
      const out = sanitizeEmailHtml(html);
      expect(out).toContain('width="600"');
      expect(out).toContain('bgcolor="#ffffff"');
      expect(out).toContain('valign="top"');
    });

    it("keeps inline styling, which is the only styling email reliably honours", () => {
      const html = '<p style="color:#0072ff;font-size:16px;text-align:center">Blibli Talk</p>';
      const out = sanitizeEmailHtml(html);
      expect(out).toContain("color");
      expect(out).toContain("font-size");
      expect(out).toContain("text-align");
    });

    it("keeps a hosted banner image", () => {
      const html = '<img src="https://blibli.com/banner.png" alt="Blibli Talk" width="600">';
      const out = sanitizeEmailHtml(html);
      expect(out).toContain("https://blibli.com/banner.png");
      expect(out).toContain('alt="Blibli Talk"');
    });

    it("leaves plain text alone", () => {
      expect(sanitizeEmailHtml("Don't forget — our event starts soon!")).toBe(
        "Don't forget — our event starts soon!",
      );
    });

    it("is idempotent, so re-sanitising a stored body cannot degrade it", () => {
      const html = '<p style="color:#0072ff">Hi <a href="https://blibli.com">there</a></p>';
      const once = sanitizeEmailHtml(html);
      expect(sanitizeEmailHtml(once)).toBe(once);
    });
  });
});
