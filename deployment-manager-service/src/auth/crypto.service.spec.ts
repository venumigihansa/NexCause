import { ConfigService } from "@nestjs/config";
import { CryptoService } from "./crypto.service";

describe("CryptoService", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const config = new ConfigService({
    auth: { encryptionKey: key, encryptionKeyVersion: "v1" },
  });
  const crypto = new CryptoService(config);

  it("round-trips authenticated encrypted values without exposing plaintext", () => {
    const encrypted = crypto.encrypt("refresh-token-value");

    expect(encrypted).not.toContain("refresh-token-value");
    expect(crypto.decrypt(encrypted)).toBe("refresh-token-value");
  });

  it("hashes opaque tokens consistently", () => {
    const token = crypto.randomToken();
    const hash = crypto.hash(token);

    expect(hash).not.toBe(token);
    expect(crypto.equalHash(token, hash)).toBe(true);
    expect(crypto.equalHash(`${token}x`, hash)).toBe(false);
  });
});
