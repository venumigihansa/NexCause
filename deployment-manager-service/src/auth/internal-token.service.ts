import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { SignJWT } from "jose";

@Injectable()
export class InternalTokenService {
  constructor(private readonly config: ConfigService) {}

  async sign(
    audience: "rca-agent" | "rca-mcp",
    claims: {
      workspaceId: string;
      runId?: string;
      incidentId?: string;
    },
  ): Promise<string> {
    const secret = this.config.get<string>("internalServiceJwtSecret") ?? "";
    if (Buffer.byteLength(secret) < 32) {
      throw new InternalServerErrorException(
        "INTERNAL_SERVICE_JWT_SECRET must contain at least 32 bytes",
      );
    }
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("deployment-manager")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("2m")
      .setJti(randomUUID())
      .sign(Buffer.from(secret));
  }
}
