import type { Request } from "express";

export interface AuthPrincipal {
  userId: string;
  subject: string;
  workspaceId: string;
  organizationId: string;
  sessionIdHash: string;
  roles: string[];
  scopes: string[];
  csrfToken: string;
}

export type AuthenticatedRequest = Request & { principal: AuthPrincipal };

export interface VerifiedIdentity {
  subject: string;
  organizationId: string;
  organizationName: string;
  email?: string;
  displayName?: string;
  roles: string[];
  scopes: string[];
}
