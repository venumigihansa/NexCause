import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "crypto";

@Injectable()
export class CryptoService {
  constructor(private readonly config: ConfigService) {}

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }

  hash(value: string): string {
    return createHash("sha256").update(value).digest("base64url");
  }

  equalHash(value: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(value));
    const expected = Buffer.from(expectedHash);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  encrypt(value: string): string {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const version =
      this.config.get<string>("auth.encryptionKeyVersion") ?? "v1";
    return [version, iv, tag, encrypted]
      .map((part) =>
        typeof part === "string" ? part : part.toString("base64url"),
      )
      .join(".");
  }

  decrypt(value: string): string {
    const [, ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) {
      throw new InternalServerErrorException(
        "Encrypted session value is invalid",
      );
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  private key(): Buffer {
    const encoded = this.config.get<string>("auth.encryptionKey") ?? "";
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) {
      throw new InternalServerErrorException(
        "AUTH_SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
      );
    }
    return key;
  }
}
