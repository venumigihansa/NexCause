const WILDCARD_HOSTNAME_PATTERN =
  /^\*\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)+$/;

export function buildPublicHostname(
  appName: string,
  deploymentId: string,
  wildcardHostname: string,
): string {
  const wildcard = wildcardHostname.trim().toLowerCase();
  if (!WILDCARD_HOSTNAME_PATTERN.test(wildcard)) {
    throw new Error(
      "APPLICATION_WILDCARD_HOSTNAME must be a valid wildcard hostname",
    );
  }

  const appSegment = toDnsSafeName(appName).slice(0, 32) || "app";
  const deploymentSegment = deploymentId.slice(0, 8).toLowerCase();
  return `${appSegment}-${deploymentSegment}.${wildcard.slice(2)}`;
}

function toDnsSafeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
