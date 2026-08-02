export function timeAgo(value?: string | null): string {
  if (!value) return "unknown";
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs)) return "unknown";
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

export function statusClass(status?: string): string {
  const normalized = (status ?? "empty").toLowerCase();
  if (normalized === "running" || normalized === "succeeded") {
    return "status-running";
  }
  if (normalized === "completed" || normalized === "available") {
    return "status-completed";
  }
  if (normalized === "pending" || normalized === "creating") {
    return "status-pending";
  }
  if (normalized === "warning") return "status-warning";
  if (normalized === "failed" || normalized === "error") return "status-error";
  if (normalized === "critical") return "status-critical";
  if (normalized === "stopped") return "status-stopped";
  if (normalized === "deleted") return "status-deleted";
  if (normalized === "resolved") return "status-resolved";
  return "status-empty";
}
