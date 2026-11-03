import { describe, expect, it } from "vitest";
import { temSom } from "../src/som";
import { mp4Bytes, webmBytes } from "./helpers";

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe("se o vídeo tem som", () => {
  it("WebM: pela faixa de codec A_ antes do primeiro quadro", () => {
    expect(temSom(buf(webmBytes(false)), "video/webm")).toBe(false);
    expect(temSom(buf(webmBytes(true)), "video/webm")).toBe(true);
  });

  it("MP4: pela trilha soun do moov", () => {
    expect(temSom(buf(mp4Bytes(false)), "video/mp4")).toBe(false);
    expect(temSom(buf(mp4Bytes(true)), "video/mp4")).toBe(true);
  });

  it("sem dar para saber, null (e o vídeo segue com a camada de som)", () => {
    expect(temSom(buf(new Uint8Array([1, 2, 3, 4])), "video/mp4")).toBeNull();
    expect(temSom(buf(new Uint8Array([1, 2, 3, 4])), "video/webm")).toBeNull();
    expect(temSom(buf(webmBytes(false)), "video/x-matroska")).toBeNull();
  });
});
