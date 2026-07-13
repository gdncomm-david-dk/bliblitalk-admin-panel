declare module "svg-to-pdfkit" {
  import type PDFDocument from "pdfkit";

  export default function SVGtoPDF(
    doc: InstanceType<typeof PDFDocument>,
    svg: string,
    x?: number,
    y?: number,
    options?: Record<string, unknown>,
  ): void;
}
