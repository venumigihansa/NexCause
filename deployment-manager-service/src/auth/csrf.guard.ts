import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthenticatedRequest } from "./auth.types";
import { CryptoService } from "./crypto.service";
import { IS_PUBLIC_KEY } from "./public.decorator";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      SAFE_METHODS.has(request.method) ||
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const authenticated = request as AuthenticatedRequest;
    const token = request.header("x-csrf-token") ?? "";
    if (
      !authenticated.principal?.csrfToken ||
      !this.crypto.equalHash(
        token,
        this.crypto.hash(authenticated.principal.csrfToken),
      )
    ) {
      throw new ForbiddenException("The CSRF token is invalid");
    }
    const origin = request.header("origin");
    const allowed = new Set(
      this.config.get<string[]>("auth.allowedOrigins") ?? [],
    );
    const callbackUrl = this.config.get<string>("auth.callbackUrl");
    if (callbackUrl) {
      allowed.add(new URL(callbackUrl).origin);
    }
    if (!origin || !allowed.has(origin)) {
      throw new ForbiddenException("The request origin is not allowed");
    }
    return true;
  }
}
