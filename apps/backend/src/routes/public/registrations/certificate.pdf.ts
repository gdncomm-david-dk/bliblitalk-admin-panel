/**
 * Renders the Blibli Talk "Certificate of Participation" as a real PDF (A4
 * landscape), vector-drawn with pdfkit so no headless-browser binary is needed.
 *
 * Every position/size below is the original HTML design's CSS value (see
 * certificate.template.ts) multiplied by SCALE (96dpi px -> 72dpi pt = 0.75),
 * so this stays pixel-perfect against the approved brand reference instead of
 * hand-guessed coordinates.
 */
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import type { CertificateSettingsDTO } from "@repo/shared-types";
import { DEFAULT_CERTIFICATE_SETTINGS } from "@repo/shared-types";
import { BLIBLI_TALK_LOGO_WHITE } from "./certificate.assets";
import { BLIBLI_LOGO_WHITE } from "./certificate.template";
import type { CertificateData } from "./certificate.template";

const YELLOW = "#ffc400";
const RED = "#f5484a";
const TEAL = "#17c7c0";
const WHITE = "#ffffff";

const SCALE = 0.75;
const px = (n: number) => n * SCALE;

// Natural pixel size of the embedded wordmark PNG and the Blibli bag SVG's
// viewBox, needed to preserve aspect ratio when scaling to a target width.
const WORDMARK_ASPECT = 397 / 1000; // height / width
const BAG_LOGO_ASPECT = 48 / 136; // height / width

function pngBufferFromDataUri(dataUri: string): Buffer {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return Buffer.from(base64, "base64");
}

const wordmarkPng = pngBufferFromDataUri(BLIBLI_TALK_LOGO_WHITE);

/**
 * svg-to-pdfkit's `width`/`height` options set the *viewport*, not a forced
 * rescale — since our SVG string already declares width="136" height="48",
 * that wins and the options are silently ignored, so the logo always renders
 * at its native ~136x48pt size. Overriding those attributes directly (the
 * viewBox stays "0 0 136 48") is what actually rescales the artwork.
 */
function bagLogoSvg(width: number, height: number): string {
  return BLIBLI_LOGO_WHITE.replace('width="136" height="48"', `width="${width}" height="${height}"`);
}

export function renderCertificatePdf(
  data: CertificateData,
  settings: CertificateSettingsDTO = DEFAULT_CERTIFICATE_SETTINGS,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const marginX = px(84);
    const contentTopPadding = px(74);

    // Background
    doc.rect(0, 0, pageWidth, pageHeight).fill(settings.accentColor);

    // Decorative shapes, bottom-right — geometry ported 1:1 from the CSS
    // (.shape-circle / .shape-square / .shape-teal), not eyeballed.
    const circleRadius = px(176) / 2;
    const circleCenter: [number, number] = [pageWidth - px(88) - circleRadius, pageHeight - px(92) - circleRadius];

    const squareWidth = px(176);
    const squareHeight = px(138);
    const squareLeft = pageWidth - px(360) - squareWidth;
    const squareTop = pageHeight - px(44) - squareHeight;
    const squareCenter: [number, number] = [squareLeft + squareWidth / 2, squareTop + squareHeight / 2];

    const tealWidth = px(156);
    const tealHeight = px(116);

    doc.save();
    doc.rotate(-13, { origin: squareCenter });
    doc.roundedRect(squareLeft, squareTop, squareWidth, squareHeight, px(34)).fill(RED);
    doc.restore();
    doc.circle(circleCenter[0], circleCenter[1], circleRadius).fill(YELLOW);
    doc
      .polygon(
        [pageWidth, pageHeight - tealHeight],
        [pageWidth, pageHeight],
        [pageWidth - tealWidth, pageHeight],
      )
      .fill(TEAL);

    // Header: eyebrow + wordmark logo (left, flex gap 16px, vertically
    // centered against each other), Blibli bag logo (right).
    const eyebrowFontSize = px(26);
    const wordmarkWidth = px(148);
    const wordmarkHeight = wordmarkWidth * WORDMARK_ASPECT;
    const bagLogoWidth = px(190);
    const bagLogoHeight = bagLogoWidth * BAG_LOGO_ASPECT;
    const headerGap = px(16);

    const headerRowHeight = Math.max(eyebrowFontSize, wordmarkHeight, bagLogoHeight);
    const headerCenterY = contentTopPadding + headerRowHeight / 2;

    const eyebrowText = settings.headline.toUpperCase();
    doc.font("Helvetica-Bold").fontSize(eyebrowFontSize);
    const eyebrowWidth = doc.widthOfString(eyebrowText);
    doc
      .fillColor(WHITE)
      .text(eyebrowText, marginX, headerCenterY - eyebrowFontSize / 2, { lineBreak: false });
    doc.image(wordmarkPng, marginX + eyebrowWidth + headerGap, headerCenterY - wordmarkHeight / 2, {
      width: wordmarkWidth,
      height: wordmarkHeight,
    });
    SVGtoPDF(
      doc,
      bagLogoSvg(bagLogoWidth, bagLogoHeight),
      pageWidth - marginX - bagLogoWidth,
      headerCenterY - bagLogoHeight / 2,
      { assumePt: true },
    );

    // Content
    const contentTop = contentTopPadding + headerRowHeight + px(90);
    const leadFontSize = px(19);
    const nameFontSize = px(46);
    const eventTitleFontSize = px(22);
    const taglineFontSize = px(19);
    const contentWidth = pageWidth - marginX * 2;

    doc.font("Helvetica").fontSize(leadFontSize).text("This certificate is proudly presented to", marginX, contentTop);
    doc
      .font("Helvetica-Bold")
      .fontSize(nameFontSize)
      .text(data.name, marginX, doc.y + px(12), { width: contentWidth });
    doc
      .font("Helvetica")
      .fontSize(leadFontSize)
      .text("for participating in", marginX, doc.y + px(16));
    doc
      .font("Helvetica-Bold")
      .fontSize(eventTitleFontSize)
      .text(data.eventTitle, marginX, doc.y + px(10), { width: contentWidth });
    doc.font("Helvetica-Bold").fontSize(eventTitleFontSize).text(data.date, marginX, doc.y + px(4));
    doc
      .font("Helvetica")
      .fontSize(taglineFontSize)
      .text(
        "Your participation reflects the spirit of continuous learning, collaboration, and growth.",
        marginX,
        doc.y + px(40),
        { width: contentWidth - px(53) },
      );

    // Footer — anchored a fixed distance from the bottom edge (rather than
    // flowing from content, whose height varies with name/title length) so
    // it never collides with the decorative shapes regardless of text size.
    const recognizedFontSize = px(16);
    const recognizedLogoWidth = px(58);
    const recognizedLogoHeight = recognizedLogoWidth * BAG_LOGO_ASPECT;
    const footerY = pageHeight - px(100);

    doc.font("Helvetica-Bold").fontSize(recognizedFontSize);
    doc.text("This certificate is digitally generated and officially recognized by", marginX, footerY, {
      continued: false,
    });
    const recognizedTextWidth = doc.widthOfString("This certificate is digitally generated and officially recognized by ");
    SVGtoPDF(
      doc,
      bagLogoSvg(recognizedLogoWidth, recognizedLogoHeight),
      marginX + recognizedTextWidth,
      footerY + (recognizedFontSize - recognizedLogoHeight) / 2,
      { assumePt: true },
    );
    doc
      .font("Helvetica-Bold")
      .fontSize(recognizedFontSize)
      .text(`Certificate ID: ${data.certificateId}`, marginX, footerY + px(24));

    let extraLineY = footerY + px(48);
    if (settings.signatoryName || settings.signatoryTitle) {
      const signatoryLine = [settings.signatoryName, settings.signatoryTitle]
        .filter((part): part is string => Boolean(part))
        .join(" — ");
      doc.font("Helvetica").fontSize(px(12)).text(signatoryLine, marginX, extraLineY);
      extraLineY += px(16);
    }
    if (settings.footerNote) {
      doc.font("Helvetica").fontSize(px(12)).text(settings.footerNote, marginX, extraLineY);
    }

    doc.end();
  });
}
