import helmet from "helmet";
import type { RequestHandler } from "express";

/**
 * Security response headers for the CMS. Mounted first in createApp so error responses and
 * static files carry them too — a header set after the router misses exactly the responses
 * an attacker is most interested in.
 *
 * The policy is strict because it can be: in production this same process serves the built
 * SPA (index.ts mounts express.static on ../frontend/dist), so the app is the origin for the
 * HTML, the JS and the API, and Vite emits no inline script — verified against the built
 * index.html, which contains a single external <script type="module" src>.
 *
 * Two deliberate relaxations, both narrower than they look:
 *
 *  - `style-src 'unsafe-inline'`: several components pass React `style={{...}}` props, and
 *    CSP treats an inline style attribute as inline style. Removing them is a UI refactor,
 *    not a security fix, and style injection is a far weaker primitive than script injection.
 *  - `img-src https:`: event banners, thumbnails, speaker photos and the login carousel are
 *    free-text URL fields an admin fills in, and nothing constrains them to this origin
 *    (see SEC-012). Restricting to 'self' would silently break every externally-hosted
 *    image already in the database. `https:` still blocks http:, and images are not an
 *    execution context.
 *
 * HSTS stays off: TLS is terminated at Apps Gateway, so the header belongs at that edge.
 * Turning it on here would be guessing about infrastructure this repo cannot see.
 *
 * See docs/REMEDIATION.md SEC-032.
 */
export function createSecurityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // Serving uploads cross-origin to the portal is the current (Phase 6) arrangement;
    // CORP's default of same-origin would break those <img> tags.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
}

/**
 * Uploaded files are stored with a client-declared extension and their bytes are never
 * validated (SEC-017), so a file whose declared type was image/gif and whose content is HTML
 * is served with a plausible image Content-Type. `nosniff` is what stops a browser deciding
 * for itself and executing it. Applied to the upload route specifically, on top of the
 * blanket policy above, so the reason stays attached to the route it protects.
 */
export const uploadsNoSniff: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
};
