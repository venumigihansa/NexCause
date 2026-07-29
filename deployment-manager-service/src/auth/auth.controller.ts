import { Body, Controller, Get, Post, Query, Req, Res } from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";
import { Public } from "./public.decorator";
import { RequirePermissions } from "./permissions.decorator";

class SwitchOrganizationDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get("login")
  async login(
    @Query("returnTo") returnTo: string | undefined,
    @Res() response: Response,
  ) {
    const result = await this.auth.beginLogin(returnTo);
    return response.redirect(302, result.redirectUrl);
  }

  @Public()
  @Get("callback")
  async callback(
    @Query() query: Record<string, string | string[] | undefined>,
    @Res() response: Response,
  ) {
    let result;
    try {
      result = await this.auth.completeLogin(query);
    } catch (error) {
      await this.auth.recordFailedLogin();
      throw error;
    }
    response.cookie(
      "rca_session",
      result.sessionToken,
      this.auth.cookieOptions(),
    );
    return response.redirect(302, result.redirectUrl);
  }

  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.me(request.principal);
  }

  @Get("metrics")
  @RequirePermissions("members:manage")
  metrics(@Req() request: AuthenticatedRequest) {
    return this.auth.metrics(request.principal);
  }

  @Post("logout")
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const result = await this.auth.logout(request.principal);
    response.clearCookie("rca_session", this.auth.clearCookieOptions());
    return response.redirect(303, result.redirectUrl);
  }

  @Post("switch-organization")
  async switchOrganization(
    @Req() request: AuthenticatedRequest,
    @Body() body: SwitchOrganizationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const next = await this.auth.switchOrganization(
      request.principal,
      body.organizationId,
    );
    response.cookie(
      "rca_session",
      next.sessionToken,
      this.auth.cookieOptions(),
    );
    return { organizationId: body.organizationId, csrfToken: next.csrfToken };
  }
}
