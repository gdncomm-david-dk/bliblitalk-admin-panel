import { describe, it, expect } from "vitest";
import { sniffImageType } from "./imageType";

/**
 * SEC-017. The point of these tests is the last one: the upload route used to accept
 * whatever `Content-Type` the client claimed, so an HTML payload labelled `image/gif` was
 * stored and served. Type now comes from the bytes, and nothing else.
 */
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const gif = () => Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(16)]);
const webp = () =>
  Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]), // little-endian chunk size
    Buffer.from("WEBP", "latin1"),
    Buffer.alloc(16),
  ]);

describe("sniffImageType", () => {
  it("identifies each permitted format from its signature", () => {
    expect(sniffImageType(png())).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffImageType(jpeg())).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffImageType(gif())).toEqual({ mime: "image/gif", ext: "gif" });
    expect(sniffImageType(webp())).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("accepts GIF87a as well as GIF89a", () => {
    const old = Buffer.concat([Buffer.from("GIF87a", "latin1"), Buffer.alloc(4)]);
    expect(sniffImageType(old)?.ext).toBe("gif");
  });

  it("rejects the payloads that used to pass as an image", () => {
    // Exactly the review's scenario: HTML sent with `Content-Type: image/gif`.
    expect(sniffImageType(Buffer.from("<html><script>alert(1)</script>", "utf8"))).toBeNull();
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8"))).toBeNull();
    expect(sniffImageType(Buffer.from("%PDF-1.7", "latin1"))).toBeNull();
  });

  it("rejects a RIFF container that is not WEBP, such as a WAV", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WAVE", "latin1"),
      Buffer.alloc(16),
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });

  it("rejects truncated input rather than reading past the end", () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniffImageType(Buffer.from("RIFF", "latin1"))).toBeNull();
  });
});
