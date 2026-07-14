/**
 * Renders the Blibli Talk "Certificate of Participation" as a self-contained HTML
 * document (inline CSS + inline SVG logo, no external assets) so it can be served
 * directly for download / print-to-PDF. Landscape A4, vivid Blibli blue.
 */

import { BLIBLI_TALK_LOGO_WHITE } from "./certificate.assets";

export interface CertificateData {
  name: string;
  eventTitle: string;
  date: string;
  certificateId: string;
}

/** Blibli horizontal wordmark (bag + "blibli"), white — inlined to avoid asset deps. */
export const BLIBLI_LOGO_WHITE = `<svg width="136" height="48" viewBox="0 0 136 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M31.5938 13.075C32.7017 13.075 33.595 14.0223 33.4151 15.1307C31.4517 26.4803 31.4517 33.5413 34.3305 43.8172C34.6872 44.9761 33.7939 46.0498 32.6323 46.0498H3.77772C2.61608 46.0498 1.72276 44.9793 2.07946 43.8172C4.93935 33.5413 4.93935 26.4803 2.97278 15.1307C2.81179 14.0223 3.70511 13.075 4.79414 13.075H4.93619C10.7254 13.6623 14.4755 13.9497 18.194 13.9497C21.9124 13.9497 25.6467 13.6465 31.4517 13.075H31.5938ZM13.6736 21.2321C13.6736 21.9269 13.0643 22.5711 12.2973 22.5711C11.5302 22.5711 10.9936 21.9458 10.9936 21.2321C10.9936 20.4995 11.5302 19.8932 12.2973 19.8932C13.0675 19.8932 13.6736 20.4995 13.6736 21.2321ZM23.983 22.5711C24.7501 22.5711 25.3593 21.9269 25.3593 21.2321C25.3593 20.4995 24.7533 19.8932 23.983 19.8932C23.216 19.8932 22.6794 20.4995 22.6794 21.2321C22.6794 21.9458 23.216 22.5711 23.983 22.5711ZM10.7253 25.7732C10.7253 28.1511 12.5467 33.0648 18.1749 33.0648C23.8031 33.0648 25.6276 28.1669 25.6245 25.7732C25.6245 25.2743 25.2299 24.8795 24.7312 24.8795C24.2324 24.8795 23.8379 25.2743 23.8379 25.7732C23.8379 27.5764 22.4458 31.2774 18.1749 31.2774C13.8882 31.2774 12.5119 27.5606 12.5119 25.7732C12.5119 25.2743 12.1174 24.8795 11.6186 24.8795C11.1199 24.8795 10.7253 25.2743 10.7253 25.7732Z" fill="white"/><path d="M21.9305 8.20541C23.9563 7.72687 25.2107 5.69606 24.7324 3.66945C24.254 1.64285 22.224 0.387902 20.1983 0.86644C18.1725 1.34498 16.918 3.37579 17.3964 5.40239C17.8747 7.429 19.9047 8.68395 21.9305 8.20541Z" fill="white"/><path d="M30.0249 11.9449L30.1606 8.1838C30.2048 6.93011 28.8222 6.14063 27.7679 6.82274L20.7381 11.367C20.2394 11.6891 19.9364 12.1596 19.8164 12.6649C22.6763 12.6017 25.735 12.3586 30.0249 11.9449Z" fill="white"/><path d="M6.58102 11.9699C11.1739 12.4215 14.6588 12.6836 18.1058 12.6868L16.458 7.22358C16.1455 6.18463 15.0502 5.59726 14.0117 5.90989L7.40489 7.90253C6.36637 8.21517 5.77924 9.31096 6.09174 10.3499L6.58102 11.9699Z" fill="white"/><path d="M113.231 29.6521C112.649 28.1746 111.846 26.896 110.85 25.8542C109.851 24.8155 108.665 23.9916 107.331 23.4138C107.312 23.4043 105.427 22.4888 103.22 22.5362C101.883 22.5646 101.153 22.8961 100.568 23.2118C100.514 23.2434 100.463 23.2749 100.41 23.3096C100.166 23.4707 99.5559 23.8748 99.0057 24.5472C97.956 25.829 97.8137 27.8684 98.0319 29.349L98.1173 29.9362L98.5504 29.5542C98.9362 29.2133 99.6476 28.7113 100.678 28.4587C101.228 28.323 101.807 28.3104 102.37 28.3861C103.714 28.5692 104.858 29.1533 105.778 30.1288C106.901 31.319 107.47 32.8565 107.47 34.697C107.47 36.5439 106.898 38.0592 105.769 39.2021C104.637 40.3481 103.189 40.929 101.462 40.929C99.7203 40.929 98.2754 40.3639 97.1592 39.2526C95.376 37.472 95.4993 33.9646 95.5025 33.9141V13.2261C95.5025 13.1219 95.4329 13.0272 95.3317 12.9988L94.6108 12.781C93.9911 12.5947 93.2766 12.5 92.4861 12.5C91.4174 12.5 90.5574 12.7179 89.9346 13.1504C89.3781 13.5355 89.0967 14.2522 89.0967 15.2719V33.5668C89.0967 35.5178 89.2959 37.2258 89.6879 38.6464C90.0768 40.045 90.6302 41.232 91.3384 42.176C92.4703 43.6629 93.9342 44.8089 95.6922 45.5824C97.4691 46.3622 99.4705 46.76 101.646 46.76C103.423 46.76 105.092 46.4632 106.61 45.8792C108.124 45.2951 109.449 44.4711 110.553 43.4293C111.653 42.3907 112.529 41.1058 113.158 39.6156C113.787 38.1224 114.103 36.4523 114.103 34.6528C114.113 32.8123 113.816 31.1328 113.231 29.6521Z" fill="white"/><path d="M74.5277 12.7902C73.8891 12.604 73.165 12.5061 72.3777 12.5061C71.309 12.5061 70.449 12.724 69.8262 13.1565C69.2697 13.5416 68.9883 14.2582 68.9883 15.278V46.1062H75.4383V13.0618L74.5277 12.7902Z" fill="white"/><path d="M82.486 19.6662C83.5009 19.6662 84.3672 19.3221 85.0597 18.6465C85.7489 17.9709 86.0967 17.1185 86.0967 16.1083C86.0967 15.098 85.7458 14.233 85.0565 13.5448C84.3641 12.8565 83.5009 12.5061 82.4891 12.5061C81.4773 12.5061 80.6237 12.8534 79.947 13.5416C79.2704 14.233 78.9258 15.0949 78.9258 16.1114C78.9258 17.1248 79.2673 17.9804 79.9439 18.6528C80.6142 19.3253 81.471 19.6662 82.486 19.6662Z" fill="white"/><path d="M82.6717 23.2117C81.603 23.2117 80.743 23.4295 80.1201 23.862C79.5636 24.2503 79.2822 24.9638 79.2822 25.9835V46.1063H85.7354V23.7641L84.8248 23.4926C84.1862 23.3064 83.4621 23.2117 82.6717 23.2117Z" fill="white"/><path d="M122.53 12.7902C121.891 12.604 121.167 12.5061 120.38 12.5061C119.311 12.5061 118.451 12.724 117.828 13.1565C117.272 13.5448 116.987 14.2582 116.987 15.278V46.1062H123.441V13.0618L122.53 12.7902Z" fill="white"/><path d="M130.343 19.6696C131.358 19.6696 132.224 19.3255 132.913 18.6499C133.602 17.9775 133.95 17.1219 133.95 16.1117C133.95 15.1014 133.599 14.2364 132.91 13.5482C132.218 12.8599 131.354 12.5095 130.343 12.5095C129.331 12.5095 128.474 12.8568 127.801 13.545C127.124 14.2364 126.779 15.0983 126.779 16.1148C126.779 17.1282 127.121 17.9838 127.797 18.6562C128.471 19.3255 129.328 19.6696 130.343 19.6696Z" fill="white"/><path d="M130.532 23.2117C129.46 23.2117 128.604 23.4295 127.981 23.862C127.424 24.2472 127.14 24.9638 127.14 25.9835V46.1063H133.59V23.7641L132.679 23.4926C132.044 23.3064 131.32 23.2117 130.532 23.2117Z" fill="white"/><path d="M65.134 29.6521C64.5522 28.1746 63.7491 26.896 62.7531 25.8542C61.754 24.8155 60.5683 23.9916 59.234 23.4138C59.2151 23.4043 57.3307 22.4888 55.1237 22.5362C53.7863 22.5646 53.0559 22.8961 52.471 23.2118C52.4172 23.2434 52.3666 23.2749 52.3129 23.3096C52.0694 23.4707 51.4592 23.8748 50.9091 24.5472C49.8593 25.829 49.7171 27.8684 49.9352 29.349L50.0206 29.9362L50.4538 29.5542C50.8395 29.2133 51.5541 28.7113 52.5816 28.4587C53.1318 28.323 53.7104 28.3104 54.2732 28.3861C55.617 28.5692 56.7615 29.1533 57.6816 30.1288C58.8041 31.319 59.3732 32.8565 59.3732 34.697C59.3732 36.5439 58.8009 38.0592 57.6721 39.2021C56.5402 40.3481 55.0921 40.929 53.3658 40.929C51.6236 40.929 50.1787 40.3639 49.0626 39.2526C47.2793 37.472 47.4026 33.9646 47.4058 33.9141V13.2261C47.4058 13.1219 47.3362 13.0272 47.2351 12.9988L46.5142 12.781C45.8945 12.5947 45.1799 12.5 44.3894 12.5C43.3208 12.5 42.4607 12.7179 41.8379 13.1504C41.2814 13.5355 41 14.2522 41 15.2719V33.5668C41 35.5178 41.1992 37.2258 41.5913 38.6464C41.9802 40.045 42.5335 41.232 43.2417 42.176C44.3736 43.6629 45.8375 44.8089 47.5955 45.5824C49.3724 46.3622 51.3738 46.76 53.5491 46.76C55.3261 46.76 56.9955 46.4632 58.5132 45.8792C60.0277 45.2951 61.3525 44.4711 62.4559 43.4293C63.5594 42.3907 64.432 41.1058 65.0612 39.6156C65.6904 38.1224 66.0066 36.4523 66.0066 34.6528C66.0129 32.8123 65.7189 31.1328 65.134 29.6521Z" fill="white"/></svg>`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderCertificate(data: CertificateData): string {
  const name = escapeHtml(data.name);
  const eventTitle = escapeHtml(data.eventTitle);
  const date = escapeHtml(data.date);
  const certificateId = escapeHtml(data.certificateId);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Certificate of Participation — ${name}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    background: #1668ff;
    color: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .certificate {
    position: relative;
    width: 1123px;
    height: 794px;
    max-width: 100%;
    background: #1668ff;
    color: #ffffff;
    overflow: hidden;
    padding: 74px 84px;
  }
  /* Print / save-as-PDF: exactly one A4 landscape page, edge to edge. */
  @media print {
    html, body { width: 297mm; height: 210mm; min-height: 0; display: block; }
    .certificate { width: 297mm; height: 210mm; max-width: none; }
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    z-index: 2;
  }
  .title-row { display: flex; align-items: center; gap: 16px; }
  .eyebrow {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: 0.3px;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
  }
  /* The source PNG (Logo-BlibliTalk-White.png, 1000x397) has asymmetric
     transparent padding (top 22px, bottom 81px), so its glyphs sit above the
     canvas's geometric center. align-items:center on .title-row centers the
     box, not the glyphs — nudge down so the visible wordmark lines up with
     the eyebrow text and bag logo instead of reading as "too high". */
  .wordmark-logo { width: 148px; height: auto; display: block; transform: translateY(4.4px); }
  .header-logo svg { width: 190px; height: auto; }

  .content { margin-top: 90px; max-width: 88%; position: relative; z-index: 2; }
  .lead { font-size: 19px; font-weight: 400; }
  .name {
    font-size: 46px;
    font-weight: 600;
    letter-spacing: 0.3px;
    line-height: 1.05;
    margin: 12px 0 16px;
  }
  .event-title { font-size: 22px; font-weight: 700; line-height: 1.3; margin-top: 10px; }
  .date { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .tagline { font-size: 19px; font-weight: 400; line-height: 1.5; margin-top: 40px; }

  .footer { margin-top: 46px; position: relative; z-index: 2; }
  .recognized { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; }
  .recognized svg { width: 58px; height: auto; margin-bottom: -2px; }
  .cert-id { font-size: 16px; font-weight: 700; letter-spacing: 0.3px; margin-top: 8px; }

  /* decorative shapes, bottom-right */
  .shape { position: absolute; z-index: 1; }
  .shape-circle {
    right: 130px; bottom: 88px;
    width: 208px; height: 208px; border-radius: 50%;
    background: #ffc400;
  }
  .shape-square {
    /* bottom intentionally tight: the rotated square's bounding box should
       bleed off the certificate's bottom edge, not float clear of it. */
    right: 360px; bottom: 18px;
    width: 176px; height: 138px; border-radius: 34px;
    background: #f5484a;
    transform: rotate(-13deg);
  }
  .shape-teal {
    right: 0; bottom: 0;
    width: 156px; height: 116px;
    background: #17c7c0;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }
</style>
</head>
<body>
  <div class="certificate">
    <div class="header">
      <div class="title-row">
        <div class="eyebrow">Certificate of Participation</div>
        <img class="wordmark-logo" src="${BLIBLI_TALK_LOGO_WHITE}" alt="Blibli Talk" />
      </div>
      <div class="header-logo">${BLIBLI_LOGO_WHITE}</div>
    </div>

    <div class="content">
      <p class="lead">This certificate is proudly presented to</p>
      <h1 class="name">${name}</h1>
      <p class="lead">for participating in</p>
      <p class="event-title">${eventTitle}</p>
      <p class="date">${date}</p>
      <p class="tagline">Your participation reflects the spirit of continuous learning, collaboration, and growth.</p>
    </div>

    <div class="footer">
      <div class="recognized">
        <span>This certificate is digitally generated and officially recognized by</span>
        ${BLIBLI_LOGO_WHITE}
      </div>
      <div class="cert-id">Certificate ID: ${certificateId}</div>
    </div>

    <span class="shape shape-circle"></span>
    <span class="shape shape-square"></span>
    <span class="shape shape-teal"></span>
  </div>
</body>
</html>`;
}
