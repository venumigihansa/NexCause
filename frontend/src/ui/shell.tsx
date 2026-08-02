import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Boxes,
  Gauge,
  GitBranch,
  Search,
  Settings,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { runtimeConfig } from "../config";
import { ErrorState, LoadingSkeleton } from "./components";

const navItems = [
  { to: "/", label: "Dashboard", icon: Gauge },
  { to: "/apps", label: "Apps", icon: Boxes },
  { to: "/incidents", label: "Incidents", icon: ShieldAlert },
  { to: "/rca-runs/latest", label: "RCA Runs", icon: GitBranch },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ routeError = false }: { routeError?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });

  useEffect(() => {
    if (auth.error instanceof ApiError && auth.error.status === 401) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [auth.error, location.pathname, navigate]);

  if (auth.isLoading) {
    return (
      <div className="main-panel min-h-screen p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  if (auth.error && !(auth.error instanceof ApiError && auth.error.status === 401)) {
    return (
      <div className="main-panel min-h-screen p-6">
        <ErrorState message={auth.error.message} />
      </div>
    );
  }

  return (
    <div className="shell-grid">
      <aside className="sidebar">
        <div className="flex h-full flex-col p-4">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet-500/15 text-violet-200 violet-glow">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">NexCause</div>
              <div className="text-xs text-slate-500">RCA control plane</div>
            </div>
          </div>

          <nav aria-label="Primary" className="grid gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to === "/rca-runs/latest" ? "/incidents" : item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                    isActive
                      ? "bg-violet-500/14 text-violet-100 ring-1 ring-violet-400/25"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
                  ].join(" ")
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto panel-soft p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {runtimeConfig.environment}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {auth.data?.workspace.organizationId ?? "workspace pending"}
            </div>
          </div>
        </div>
      </aside>

      <main className="main-panel min-w-0">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-[#090910]/80 px-5 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button className="btn min-w-64 justify-start text-slate-400">
              <Search className="h-4 w-4" />
              Search apps, deployments, incidents
            </button>
            <div className="flex items-center gap-3">
              <div className="hidden text-right text-xs text-slate-500 sm:block">
                <div className="text-slate-300">
                  {auth.data?.user.displayName ?? auth.data?.user.email ?? "Operator"}
                </div>
                <div>{auth.data?.roles.join(", ") || "viewer"}</div>
              </div>
              <UserCircle className="h-8 w-8 text-violet-200" />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-5 md:p-7">
          {routeError ? (
            <ErrorState message="The route failed to render. Check the console and retry." />
          ) : (
            <Outlet context={{ auth: auth.data }} />
          )}
        </div>
      </main>
    </div>
  );
}
