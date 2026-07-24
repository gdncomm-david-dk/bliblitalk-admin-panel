import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without Vitest's `globals: true`, @testing-library/react can't detect a global
// `afterEach` to auto-register its own cleanup, so each render() would otherwise
// keep accumulating into the same document across every test in a file.
afterEach(() => {
  cleanup();
});
