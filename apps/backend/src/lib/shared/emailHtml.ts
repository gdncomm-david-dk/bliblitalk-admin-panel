import sanitizeHtml from "sanitize-html";

/**
 * SEC-015: marketing campaigns and event reminders let an admin type raw HTML into a textarea
 * (`MarketingEmailPage.tsx`, `RemindersTab.tsx`) and that string went to `sendBulkEmail`
 * untouched. The author is a trusted internal actor, so this is not an active XSS path — but
 * the recipients are real participants outside the CMS, and nothing stopped a paste from a
 * word processor, a copied marketing template, or a compromised admin account from putting a
 * script tag, an event handler, or a `javascript:` link into their inbox.
 *
 * Sanitising here rather than at each call site is deliberate: this module is the single
 * chokepoint every outbound message passes through, so a future sender cannot forget to call
 * it. Both current callers are admin-authored bulk sends; there are no system-generated
 * templates in this app whose markup the allowlist could break.
 *
 * The allowlist is written for HTML email specifically, which is why it looks dated:
 * - Tables are layout, not data, in most mail clients, so the table tags and their
 *   `width`/`align`/`bgcolor`/`cellpadding` attributes stay.
 * - Inline `style` is how email is styled at all — `<head>` styles are stripped by several
 *   major clients — so a bounded set of style properties is allowed rather than none.
 * - `<script>`, `<iframe>`, `<object>`, `<form>` and every `on*` handler are dropped. They do
 *   not survive a mail client anyway; allowing them only creates a payload that executes if
 *   the message is ever opened in a browser instead.
 */

/** Style properties an email may set inline. Anything else is dropped from the attribute. */
const ALLOWED_STYLES: Record<string, RegExp[]> = {
  // Colours: hex, rgb()/rgba(), or a bare CSS colour keyword.
  color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
  "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
  "font-size": [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
  "font-weight": [/^(normal|bold|bolder|lighter|[1-9]00)$/],
  "font-family": [/^[\w\s"',-]+$/],
  "font-style": [/^(normal|italic|oblique)$/],
  "text-align": [/^(left|right|center|justify)$/],
  "text-decoration": [/^(none|underline|line-through)$/],
  "line-height": [/^\d+(\.\d+)?(px|pt|em|rem|%)?$/],
  padding: [/^[\d\s.]+(px|pt|em|rem|%)?[\d\s.a-z%]*$/],
  margin: [/^[\d\s.]+(px|pt|em|rem|%)?[\d\s.a-z%]*$/],
  border: [/^[\w\s#(),.%-]+$/],
  "border-radius": [/^[\d\s.]+(px|pt|em|rem|%)?[\d\s.a-z%]*$/],
  width: [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
  "max-width": [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
  height: [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
  display: [/^(block|inline|inline-block|none|table|table-cell|table-row)$/],
};

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "div", "span",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "small", "sub", "sup", "blockquote", "pre", "code",
    "ul", "ol", "li",
    "a", "img",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    "center", "font",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel", "style"],
    img: ["src", "alt", "title", "width", "height", "style"],
    table: ["width", "align", "bgcolor", "border", "cellpadding", "cellspacing", "role", "style"],
    td: ["width", "height", "align", "valign", "bgcolor", "colspan", "rowspan", "style"],
    th: ["width", "height", "align", "valign", "bgcolor", "colspan", "rowspan", "style"],
    tr: ["align", "valign", "bgcolor", "style"],
    col: ["width", "span", "style"],
    colgroup: ["width", "span", "style"],
    font: ["color", "face", "size"],
    "*": ["style"],
  },
  allowedStyles: { "*": ALLOWED_STYLES },
  // Anything not listed here — notably `javascript:` and `data:` — is dropped along with the
  // attribute that carried it. `mailto` and `tel` are kept because a campaign footer routinely
  // links to a contact address.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "cid"] },
  // A protocol-relative `//evil.example` inherits the opener's scheme and is not covered by
  // `allowedSchemes`, so it is refused outright — matching the SafeUrl rule the shared
  // contracts apply to stored URLs.
  allowProtocolRelative: false,
  // Drop the *content* of these, not just the tags: leaving the body of a <script> behind
  // turns a blocked payload into visible junk text in the recipient's message.
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
};

/**
 * Returns the message body with anything outside the email allowlist removed.
 *
 * Non-destructive by intent: ordinary formatting an admin actually writes — paragraphs, links,
 * lists, images, layout tables, inline styling — passes through unchanged. Only markup that
 * cannot legitimately appear in a newsletter is stripped.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
