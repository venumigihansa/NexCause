import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PERMISSIONS_KEY = "auth:permissions";
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
