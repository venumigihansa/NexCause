import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { SessionService } from "./session.service";

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.rca_session as string | undefined;
    if (!token) {
      throw new UnauthorizedException("Authentication is required");
    }
    const principal = await this.sessions.authenticate(token);
    if (!principal) {
      throw new UnauthorizedException("The session is invalid or expired");
    }
    Object.assign(request, { principal });
    return true;
  }
}
