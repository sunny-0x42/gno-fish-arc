declare module "node:fs" {
  export function readFileSync(path: URL): Uint8Array & {
    buffer: ArrayBuffer;
    byteOffset: number;
    byteLength: number;
  };
}
