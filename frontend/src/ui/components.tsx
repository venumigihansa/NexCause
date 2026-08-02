import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronRight,
  Circle,
  MoreVertical,
  Search,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import { statusClass } from "../lib/format";

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-slate-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
        statusClass(status),
      )}
    >
      <Circle className="h-2 w-2 fill-current" />
      {status ?? "unknown"}
    </span>
  );
}

export function PermissionGate({
  permissions,
  require,
  children,
}: {
  permissions: string[];
  require: string;
  children: ReactNode;
}) {
  return permissions.includes(require) ? <>{children}</> : null;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex min-h-48 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full border border-violet-400/25 bg-violet-500/10 p-3 text-violet-200">
        <Search className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="panel border-red-400/20 bg-red-950/20 p-5 text-red-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />
        <div>
          <h2 className="font-semibold">Something needs attention</h2>
          <p className="mt-1 text-sm text-red-100/80">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="grid gap-4">
      {[0, 1, 2].map((item) => (
        <div key={item} className="panel h-28 animate-pulse bg-white/[0.04]" />
      ))}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
    </div>
  );
}

export function DataTable<T>({
  rows,
  columns,
  getHref,
}: {
  rows: T[];
  columns: Array<{ key: string; header: string; render: (row: T) => ReactNode }>;
  getHref?: (row: T) => string;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.14em] text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
                  {column.header}
                </th>
              ))}
              {getHref ? <th className="w-10 px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {rows.map((row, index) => (
              <tr key={index} className="hover:bg-white/[0.025]">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 align-top text-slate-300">
                    {column.render(row)}
                  </td>
                ))}
                {getHref ? (
                  <td className="px-4 py-3">
                    <Link
                      className="text-violet-300 hover:text-violet-100"
                      to={getHref(row)}
                      aria-label="Open"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ActionMenu({
  items,
}: {
  items: Array<{ label: string; onSelect: () => void; danger?: boolean }>;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="btn" aria-label="Actions">
        <MoreVertical className="h-4 w-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="z-50 min-w-44 rounded-lg border border-white/10 bg-[#101018] p-1 shadow-2xl">
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              onSelect={item.onSelect}
              className={clsx(
                "cursor-pointer rounded-md px-3 py-2 text-sm outline-none hover:bg-white/8",
                item.danger ? "text-red-200" : "text-slate-200",
              )}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
