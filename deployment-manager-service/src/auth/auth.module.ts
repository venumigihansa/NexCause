import { Global, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthenticationGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CryptoService } from "./crypto.service";
import { CsrfGuard } from "./csrf.guard";
import { OidcService } from "./oidc.service";
import { PermissionGuard } from "./permission.guard";
import { SessionService } from "./session.service";
import { WorkspaceService } from "./workspace.service";
import { InternalTokenService } from "./internal-token.service";
import { AuthorizationService } from "./authorization.service";
import { AuditInterceptor } from "./audit.interceptor";
import { TenantContextInterceptor } from "./tenant-context.interceptor";

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CryptoService,
    OidcService,
    SessionService,
    WorkspaceService,
    AuthorizationService,
    InternalTokenService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [SessionService, InternalTokenService, AuthorizationService],
})
export class AuthModule {}
