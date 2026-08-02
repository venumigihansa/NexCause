import { z } from "zod";

export const createAppSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, "Use DNS-safe lowercase names"),
  displayName: z.string().min(1),
  sourceType: z.enum(["image", "git"]),
  image: z.string().optional(),
  defaultPort: z.coerce.number().int().positive().optional(),
  repoUrl: z.string().url().optional().or(z.literal("")),
  branch: z.string().optional(),
  buildContext: z.string().optional(),
  dockerfilePath: z.string().optional(),
});

export type CreateAppFormValues = z.input<typeof createAppSchema>;
export type CreateAppInput = z.output<typeof createAppSchema>;

export const createDeploymentSchema = z.object({
  image: z.string().optional(),
  buildId: z.string().optional(),
  port: z.coerce.number().int().positive(),
  replicas: z.coerce.number().int().positive(),
  expose: z.boolean().default(false),
  envText: z.string().optional(),
  secretsText: z.string().optional(),
});

export type CreateDeploymentFormValues = z.input<typeof createDeploymentSchema>;
export type CreateDeploymentInput = z.output<typeof createDeploymentSchema>;

export function parseKeyValueText(value?: string): Record<string, string> {
  if (!value?.trim()) return {};
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        if (index < 1) return [line, ""];
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}
