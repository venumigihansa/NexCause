import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Activity,
  ExternalLink,
  Play,
  Plus,
  RotateCw,
  Send,
  Square,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import {
  createAppSchema,
  createDeploymentSchema,
  parseKeyValueText,
  type CreateAppFormValues,
  type CreateAppInput,
  type CreateDeploymentFormValues,
  type CreateDeploymentInput,
} from "../lib/forms";
import { compactNumber, timeAgo } from "../lib/format";
import type { AppRecord, AuthMe, BuildRecord, DeploymentRecord } from "../lib/types";
import {
  ActionMenu,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  PermissionGate,
  StatusBadge,
} from "./components";

type OutletAuth = { auth?: AuthMe };

function useAuth() {
  return useOutletContext<OutletAuth>().auth;
}

export function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <section className="panel w-full max-w-md p-8 text-center violet-glow">
        <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
          <Activity className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-semibold text-white">NexCause</h1>
        <p className="mt-3 text-sm text-slate-400">
          Deploy workloads, watch telemetry, and run RCA from one Kubernetes
          control plane.
        </p>
        <a className="btn btn-primary mt-8 w-full" href="/auth/login">
          Sign in with Asgardeo
        </a>
      </section>
    </main>
  );
}

export function DashboardPage() {
  const apps = useQuery({ queryKey: ["apps"], queryFn: api.apps.list });
  const incidents = useQuery({
    queryKey: ["incidents", "open"],
    queryFn: () => api.incidents.list("open"),
  });

  if (apps.isLoading || incidents.isLoading) return <LoadingSkeleton />;
  if (apps.error) return <ErrorState message={apps.error.message} />;

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Operational command center"
        description="A compact view of apps, incidents, and RCA activity across the active workspace."
        actions={
          <Link className="btn btn-primary" to="/apps/new">
            <Plus className="h-4 w-4" />
            New app
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Apps" value={apps.data?.length ?? 0} />
        <MetricCard label="Open incidents" value={incidents.data?.length ?? 0} />
        <MetricCard label="Telemetry" value="Live" caption="Prometheus/Loki/Tempo" />
        <MetricCard label="RCA agent" value="Ready" caption="MCP-backed workflows" />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Recent apps
          </h2>
          {apps.data?.length ? (
            <DataTable
              rows={apps.data.slice(0, 6)}
              getHref={(app) => `/apps/${app.id}`}
              columns={[
                { key: "name", header: "App", render: (app) => app.displayName },
                { key: "source", header: "Source", render: (app) => app.sourceType },
                {
                  key: "target",
                  header: "Target",
                  render: (app) => app.repoUrl ?? app.image ?? "not configured",
                },
              ]}
            />
          ) : (
            <EmptyState
              title="No apps yet"
              description="Create the first app and NexCause will give you builds, deployments, telemetry, and RCA from there."
              action={
                <Link className="btn btn-primary" to="/apps/new">
                  Create app
                </Link>
              }
            />
          )}
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Open incidents
          </h2>
          <div className="grid gap-3">
            {incidents.data?.length ? (
              incidents.data.slice(0, 5).map((incident) => (
                <Link
                  className="panel flex items-start justify-between gap-3 p-4 hover:border-violet-300/35"
                  key={incident.id}
                  to={`/incidents/${incident.id}`}
                >
                  <div>
                    <StatusBadge status={incident.severity} />
                    <div className="mt-2 font-medium text-white">{incident.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {timeAgo(incident.openedAt)}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="panel p-5 text-sm text-slate-400">
                No open incidents. Quiet clusters are underrated.
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export function AppsPage() {
  const auth = useAuth();
  const apps = useQuery({ queryKey: ["apps"], queryFn: api.apps.list });
  if (apps.isLoading) return <LoadingSkeleton />;
  if (apps.error) return <ErrorState message={apps.error.message} />;

  return (
    <>
      <PageHeader
        title="Apps"
        description="Each app owns builds, deployments, telemetry, incidents, and RCA runs."
        actions={
          <PermissionGate permissions={auth?.permissions ?? []} require="apps:create">
            <Link className="btn btn-primary" to="/apps/new">
              <Plus className="h-4 w-4" />
              Create app
            </Link>
          </PermissionGate>
        }
      />
      {apps.data?.length ? (
        <DataTable
          rows={apps.data}
          getHref={(app) => `/apps/${app.id}`}
          columns={[
            { key: "name", header: "Name", render: (app) => app.displayName },
            { key: "slug", header: "Slug", render: (app) => app.name },
            { key: "source", header: "Source", render: (app) => app.sourceType },
            { key: "port", header: "Port", render: (app) => app.defaultPort ?? "none" },
            {
              key: "target",
              header: "Repository/Image",
              render: (app) => app.repoUrl ?? app.image ?? "not configured",
            },
          ]}
        />
      ) : (
        <EmptyState
          title="No apps"
          description="Create a git-backed or image-backed app to start deploying workloads."
        />
      )}
    </>
  );
}

export function CreateAppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<CreateAppFormValues, unknown, CreateAppInput>({
    resolver: zodResolver(createAppSchema),
    defaultValues: {
      sourceType: "image",
      branch: "main",
      buildContext: ".",
      dockerfilePath: "Dockerfile",
    },
  });
  const sourceType = form.watch("sourceType");
  const create = useMutation({
    mutationFn: (input: CreateAppInput) => {
      const body = {
        ...input,
        repoUrl: input.repoUrl || undefined,
        defaultPort: input.defaultPort || undefined,
      };
      return api.apps.create(body);
    },
    onSuccess: async (app) => {
      await queryClient.invalidateQueries({ queryKey: ["apps"] });
      navigate(`/apps/${app.id}`);
    },
  });

  return (
    <>
      <PageHeader title="Create app" description="Define the source NexCause will build or deploy." />
      <form
        className="panel grid max-w-3xl gap-5 p-5"
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <Field label="Name" error={form.formState.errors.name?.message}>
          <input className="field" {...form.register("name")} placeholder="orders-api" />
        </Field>
        <Field label="Display name" error={form.formState.errors.displayName?.message}>
          <input className="field" {...form.register("displayName")} placeholder="Orders API" />
        </Field>
        <Field label="Source type">
          <select className="field" {...form.register("sourceType")}>
            <option value="image">Container image</option>
            <option value="git">Git repository</option>
          </select>
        </Field>
        {sourceType === "image" ? (
          <Field label="Image">
            <input className="field" {...form.register("image")} placeholder="nginx:1.27" />
          </Field>
        ) : (
          <>
            <Field label="Repository URL">
              <input
                className="field"
                {...form.register("repoUrl")}
                placeholder="https://github.com/org/repo"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Branch">
                <input className="field" {...form.register("branch")} />
              </Field>
              <Field label="Build context">
                <input className="field" {...form.register("buildContext")} />
              </Field>
              <Field label="Dockerfile">
                <input className="field" {...form.register("dockerfilePath")} />
              </Field>
            </div>
          </>
        )}
        <Field label="Default port">
          <input className="field" type="number" {...form.register("defaultPort")} />
        </Field>
        {create.error ? <ErrorState message={create.error.message} /> : null}
        <button className="btn btn-primary justify-self-start" disabled={create.isPending}>
          Create app
        </button>
      </form>
    </>
  );
}

export function AppDetailPage() {
  const { appId = "" } = useParams();
  const auth = useAuth();
  const app = useQuery({ queryKey: ["apps", appId], queryFn: () => api.apps.get(appId) });
  const builds = useQuery({
    queryKey: ["apps", appId, "builds"],
    queryFn: () => api.builds.list(appId),
  });
  const deployments = useQuery({
    queryKey: ["apps", appId, "deployments"],
    queryFn: () => api.deployments.list(appId),
  });
  const startBuild = useMutation({
    mutationFn: () => api.builds.create(appId, {}),
  });

  if (app.isLoading) return <LoadingSkeleton />;
  if (app.error) return <ErrorState message={app.error.message} />;
  if (!app.data) return null;

  return (
    <>
      <PageHeader
        eyebrow={app.data.sourceType}
        title={app.data.displayName}
        description={app.data.repoUrl ?? app.data.image ?? "No source configured"}
        actions={
          <>
            {app.data.sourceType === "git" ? (
              <PermissionGate permissions={auth?.permissions ?? []} require="builds:start">
                <button className="btn" onClick={() => startBuild.mutate()}>
                  <Play className="h-4 w-4" />
                  Start build
                </button>
              </PermissionGate>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Default port" value={app.data.defaultPort ?? "none"} />
        <MetricCard label="Builds" value={builds.data?.length ?? 0} />
        <MetricCard label="Deployments" value={deployments.data?.length ?? 0} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ResourceSection title="Builds">
          <BuildsTable appId={appId} builds={builds.data ?? []} />
        </ResourceSection>
        <ResourceSection
          title="Deployments"
          action={
            <CreateDeploymentPanel
              app={app.data}
              builds={builds.data ?? []}
              permissions={auth?.permissions ?? []}
            />
          }
        >
          <DeploymentsTable appId={appId} deployments={deployments.data ?? []} />
        </ResourceSection>
      </div>
    </>
  );
}

export function BuildDetailPage() {
  const { appId = "", buildId = "" } = useParams();
  const build = useQuery({
    queryKey: ["builds", buildId],
    queryFn: () => api.builds.get(buildId),
    refetchInterval: (query) =>
      ["pending", "running"].includes(String(query.state.data?.status)) ? 5000 : false,
  });
  const logs = useQuery({
    queryKey: ["builds", buildId, "logs"],
    queryFn: () => api.builds.logs(buildId),
  });

  if (build.isLoading) return <LoadingSkeleton />;
  if (build.error) return <ErrorState message={build.error.message} />;
  if (!build.data) return null;

  return (
    <>
      <PageHeader
        title={`Build ${build.data.id.slice(0, 8)}`}
        description={`${build.data.strategy} build for branch ${build.data.branch ?? "unknown"}`}
        actions={<Link className="btn" to={`/apps/${appId}`}>Back to app</Link>}
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Status" value={<StatusBadge status={build.data.status} />} />
        <MetricCard label="Image" value={<SmallCode value={build.data.image ?? "pending"} />} />
        <MetricCard label="Context" value={build.data.buildContext ?? "."} />
        <MetricCard label="Updated" value={timeAgo(build.data.updatedAt)} />
      </div>
      <section className="mt-6 panel p-4">
        <h2 className="mb-3 font-semibold text-white">Build logs</h2>
        <LogBlock entries={logs.data?.map((item) => `${item.podName}\n${item.logs}`) ?? []} />
      </section>
    </>
  );
}

export function DeploymentDetailPage() {
  const { appId = "", deploymentId = "" } = useParams();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const deployments = useQuery({
    queryKey: ["apps", appId, "deployments"],
    queryFn: () => api.deployments.list(appId),
  });
  const deployment = deployments.data?.find((item) => item.id === deploymentId);
  const overview = useQuery({
    queryKey: ["telemetry", appId, deploymentId, "overview"],
    queryFn: () => api.telemetry.overview(appId, deploymentId),
  });
  const mutate = useMutation({
    mutationFn: (action: "restart" | "stop" | "start" | "delete") => {
      if (action === "restart") return api.deployments.restart(deploymentId);
      if (action === "stop") return api.deployments.stop(deploymentId);
      if (action === "start") return api.deployments.start(deploymentId);
      return api.deployments.delete(deploymentId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apps", appId, "deployments"] }),
  });

  if (deployments.isLoading) return <LoadingSkeleton />;
  if (deployments.error) return <ErrorState message={deployments.error.message} />;
  if (!deployment) {
    return <ErrorState message="Deployment was not found for this app." />;
  }

  return (
    <>
      <PageHeader
        eyebrow={deployment.namespace}
        title={deployment.kubernetesDeployment}
        description={deployment.image}
        actions={
          <PermissionGate permissions={auth?.permissions ?? []} require="deployments:write">
            <button className="btn" onClick={() => mutate.mutate("restart")}>
              <RotateCw className="h-4 w-4" />
              Restart
            </button>
            <button
              className="btn"
              onClick={() => mutate.mutate(deployment.status === "stopped" ? "start" : "stop")}
            >
              <Square className="h-4 w-4" />
              {deployment.status === "stopped" ? "Start" : "Stop"}
            </button>
            <ActionMenu
              items={[
                {
                  label: "Delete deployment",
                  danger: true,
                  onSelect: () => mutate.mutate("delete"),
                },
              ]}
            />
          </PermissionGate>
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Status" value={<StatusBadge status={deployment.status} />} />
        <MetricCard label="Replicas" value={deployment.replicas} />
        <MetricCard label="Port" value={deployment.port} />
        <MetricCard
          label="Public URL"
          value={
            deployment.publicUrl || deployment.publicHostname ? (
              <a
                className="inline-flex items-center gap-1 text-sm text-violet-200"
                href={deployment.publicUrl ?? `https://${deployment.publicHostname}`}
              >
                Open <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              "internal"
            )
          }
        />
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <section className="panel p-4">
          <h2 className="font-semibold text-white">Overview</h2>
          <pre className="mt-3 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
            {JSON.stringify(overview.data ?? {}, null, 2)}
          </pre>
        </section>
        <section className="panel p-4">
          <h2 className="font-semibold text-white">RCA</h2>
          <p className="mt-2 text-sm text-slate-400">
            Start an RCA run directly from this deployment when telemetry or events look suspicious.
          </p>
          <button className="btn btn-primary mt-4" onClick={() => api.rca.startForDeployment(deploymentId)}>
            Run RCA
          </button>
          <Link className="btn mt-4 ml-2" to={`/apps/${appId}/deployments/${deploymentId}/telemetry`}>
            View telemetry
          </Link>
        </section>
      </div>
    </>
  );
}

export function TelemetryPage() {
  const { appId = "", deploymentId = "" } = useParams();
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [logLevel, setLogLevel] = useState<string | undefined>();
  const overview = useQuery({
    queryKey: ["telemetry", appId, deploymentId, "overview"],
    queryFn: () => api.telemetry.overview(appId, deploymentId),
  });
  const metrics = useQuery({
    queryKey: ["telemetry", appId, deploymentId, "metrics", windowMinutes],
    queryFn: () => api.telemetry.metrics(appId, deploymentId, windowMinutes),
  });
  const logs = useQuery({
    queryKey: ["telemetry", appId, deploymentId, "logs", windowMinutes, logLevel],
    queryFn: () => api.telemetry.logs(appId, deploymentId, windowMinutes, logLevel),
  });
  const traces = useQuery({
    queryKey: ["telemetry", appId, deploymentId, "traces", windowMinutes],
    queryFn: () => api.telemetry.traces(appId, deploymentId, windowMinutes),
  });
  const kubernetes = useQuery({
    queryKey: ["telemetry", appId, deploymentId, "kubernetes", windowMinutes],
    queryFn: () => api.telemetry.kubernetes(appId, deploymentId, windowMinutes),
  });
  const chartData = useMemo(() => {
    const first = metrics.data?.series?.[0];
    return first?.values.map((point) => ({
      timestamp: new Date(point.timestamp).toLocaleTimeString(),
      value: point.value,
    })) ?? [];
  }, [metrics.data]);

  return (
    <>
      <PageHeader
        eyebrow="Telemetry"
        title="Deployment observability"
        description="Metrics, logs, traces, Kubernetes status, and stored health samples scoped to one deployment."
        actions={
          <div className="flex gap-2">
            {[30, 60, 360].map((minutes) => (
              <button
                className={minutes === windowMinutes ? "btn btn-primary" : "btn"}
                key={minutes}
                onClick={() => setWindowMinutes(minutes)}
              >
                {minutes === 360 ? "6h" : `${minutes}m`}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(overview.data?.sourceStatus ?? {}).map(([source, status]) => (
          <MetricCard key={source} label={source} value={<StatusBadge status={status} />} />
        ))}
      </div>
      <div className="mt-6 grid gap-6">
        <section className="panel p-4">
          <h2 className="mb-4 font-semibold text-white">Metrics</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="metric" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748b" />
                <YAxis stroke="#64748b" tickFormatter={compactNumber} />
                <Tooltip contentStyle={{ background: "#11111a", border: "1px solid rgba(255,255,255,.12)" }} />
                <Area dataKey="value" stroke="#a78bfa" fill="url(#metric)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-white">Logs</h2>
            <select className="field max-w-40" value={logLevel ?? ""} onChange={(event) => setLogLevel(event.target.value || undefined)}>
              <option value="">All levels</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="info">Info</option>
            </select>
          </div>
          <LogBlock entries={logs.data?.logs?.map((row) => `${row.timestamp} ${row.podName} ${row.level} ${row.line}`) ?? []} />
        </section>
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="panel p-4">
            <h2 className="mb-3 font-semibold text-white">Traces</h2>
            <DataTable
              rows={traces.data?.traces ?? []}
              columns={[
                { key: "trace", header: "Trace", render: (trace) => <SmallCode value={trace.traceId} /> },
                { key: "operation", header: "Operation", render: (trace) => trace.rootOperation ?? "unknown" },
                { key: "duration", header: "Duration", render: (trace) => trace.durationMs ? `${Math.round(trace.durationMs)}ms` : "n/a" },
              ]}
            />
          </div>
          <div className="panel p-4">
            <h2 className="mb-3 font-semibold text-white">Kubernetes</h2>
            <pre className="max-h-96 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
              {JSON.stringify(kubernetes.data ?? {}, null, 2)}
            </pre>
          </div>
        </section>
      </div>
    </>
  );
}

export function IncidentsPage() {
  const [status, setStatus] = useState("open");
  const incidents = useQuery({
    queryKey: ["incidents", status],
    queryFn: () => api.incidents.list(status),
  });
  if (incidents.isLoading) return <LoadingSkeleton />;
  if (incidents.error) return <ErrorState message={incidents.error.message} />;
  return (
    <>
      <PageHeader
        title="Incidents"
        description="Automatic and manual incidents that can feed RCA runs."
        actions={
          <select className="field max-w-40" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        }
      />
      <DataTable
        rows={incidents.data ?? []}
        getHref={(incident) => `/incidents/${incident.id}`}
        columns={[
          { key: "severity", header: "Severity", render: (incident) => <StatusBadge status={incident.severity} /> },
          { key: "title", header: "Title", render: (incident) => incident.title },
          { key: "source", header: "Source", render: (incident) => incident.source },
          { key: "opened", header: "Opened", render: (incident) => timeAgo(incident.openedAt) },
        ]}
      />
    </>
  );
}

export function IncidentDetailPage() {
  const { incidentId = "" } = useParams();
  const incident = useQuery({
    queryKey: ["incidents", incidentId],
    queryFn: () => api.incidents.get(incidentId),
  });
  const startRca = useMutation({ mutationFn: () => api.rca.startForIncident(incidentId) });
  if (incident.isLoading) return <LoadingSkeleton />;
  if (incident.error) return <ErrorState message={incident.error.message} />;
  if (!incident.data) return null;
  return (
    <>
      <PageHeader
        eyebrow={incident.data.source}
        title={incident.data.title}
        description={incident.data.summary ?? "No summary provided"}
        actions={
          <button className="btn btn-primary" onClick={() => startRca.mutate()}>
            Run RCA
          </button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Severity" value={<StatusBadge status={incident.data.severity} />} />
        <MetricCard label="Status" value={<StatusBadge status={incident.data.status} />} />
        <MetricCard label="Opened" value={timeAgo(incident.data.openedAt)} />
      </div>
      <pre className="panel mt-6 overflow-auto p-4 text-xs text-slate-300">
        {JSON.stringify(incident.data, null, 2)}
      </pre>
    </>
  );
}

export function RcaRunPage() {
  const { runId = "" } = useParams();
  const [message, setMessage] = useState("");
  const run = useQuery({ queryKey: ["rca", runId], queryFn: () => api.rca.get(runId) });
  const chat = useQuery({ queryKey: ["rca", runId, "chat"], queryFn: () => api.rca.chat.list(runId) });
  const send = useMutation({
    mutationFn: () => api.rca.chat.send(runId, message),
    onSuccess: () => setMessage(""),
  });
  if (run.isLoading) return <LoadingSkeleton />;
  if (run.error) return <ErrorState message={run.error.message} />;
  return (
    <>
      <PageHeader title={`RCA run ${runId.slice(0, 8)}`} description="Agent findings, final report, and follow-up chat." />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="panel p-4">
          <h2 className="font-semibold text-white">Report</h2>
          <pre className="mt-3 max-h-[640px] overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
            {JSON.stringify(run.data, null, 2)}
          </pre>
        </section>
        <section className="panel flex min-h-[520px] flex-col p-4">
          <h2 className="font-semibold text-white">RCA chat</h2>
          <div className="mt-4 flex-1 space-y-3 overflow-auto">
            {chat.data?.map((item, index) => (
              <div key={index} className="panel-soft p-3 text-sm text-slate-300">
                <div className="mb-1 text-xs uppercase tracking-widest text-violet-300">{item.role}</div>
                {item.content}
              </div>
            ))}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate();
            }}
          >
            <input className="field" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask a follow-up" />
            <button className="btn btn-primary" disabled={!message.trim()}>
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

export function SettingsPage() {
  const auth = useAuth();
  const metrics = useQuery({
    queryKey: ["auth", "metrics"],
    queryFn: api.auth.metrics,
    enabled: auth?.permissions.includes("members:manage"),
  });
  return (
    <>
      <PageHeader title="Settings" description="Current user, workspace, roles, permissions, and session controls." />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-semibold text-white">Identity</h2>
          <pre className="mt-3 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
            {JSON.stringify(auth, null, 2)}
          </pre>
          <button
            className="btn mt-4"
            onClick={async () => {
              await api.auth.logout();
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </section>
        <section className="panel p-5">
          <h2 className="font-semibold text-white">Auth metrics</h2>
          <pre className="mt-3 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
            {JSON.stringify(metrics.data ?? "members:manage required", null, 2)}
          </pre>
        </section>
      </div>
    </>
  );
}

function BuildsTable({ appId, builds }: { appId: string; builds: BuildRecord[] }) {
  if (!builds.length) {
    return <div className="text-sm text-slate-500">No builds yet.</div>;
  }
  return (
    <DataTable
      rows={builds}
      getHref={(build) => `/apps/${appId}/builds/${build.id}`}
      columns={[
        { key: "status", header: "Status", render: (build) => <StatusBadge status={build.status} /> },
        { key: "strategy", header: "Strategy", render: (build) => build.strategy },
        { key: "branch", header: "Branch", render: (build) => build.branch ?? "main" },
        { key: "updated", header: "Updated", render: (build) => timeAgo(build.updatedAt) },
      ]}
    />
  );
}

function DeploymentsTable({
  appId,
  deployments,
}: {
  appId: string;
  deployments: DeploymentRecord[];
}) {
  if (!deployments.length) {
    return <div className="text-sm text-slate-500">No deployments yet.</div>;
  }
  return (
    <DataTable
      rows={deployments}
      getHref={(deployment) => `/apps/${appId}/deployments/${deployment.id}`}
      columns={[
        { key: "status", header: "Status", render: (deployment) => <StatusBadge status={deployment.status} /> },
        { key: "name", header: "Kubernetes", render: (deployment) => deployment.kubernetesDeployment },
        { key: "image", header: "Image", render: (deployment) => <SmallCode value={deployment.image} /> },
        { key: "public", header: "Exposure", render: (deployment) => deployment.publicHostname ? "public" : "internal" },
      ]}
    />
  );
}

function CreateDeploymentPanel({
  app,
  builds,
  permissions,
}: {
  app: AppRecord;
  builds: BuildRecord[];
  permissions: string[];
}) {
  const queryClient = useQueryClient();
  const form = useForm<CreateDeploymentFormValues, unknown, CreateDeploymentInput>({
    resolver: zodResolver(createDeploymentSchema),
    defaultValues: { port: app.defaultPort ?? 8080, replicas: 1, expose: false },
  });
  const create = useMutation({
    mutationFn: (input: CreateDeploymentInput) =>
      api.deployments.create(app.id, {
        image: input.image || undefined,
        buildId: input.buildId || undefined,
        port: input.port,
        replicas: input.replicas,
        expose: input.expose,
        env: parseKeyValueText(input.envText),
        secrets: parseKeyValueText(input.secretsText),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apps", app.id, "deployments"] }),
  });
  return (
    <PermissionGate permissions={permissions} require="deployments:write">
      <details className="panel-soft p-3">
        <summary className="cursor-pointer text-sm font-medium text-violet-200">Create deployment</summary>
        <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
          <input className="field" {...form.register("image")} placeholder="Image override" />
          <select className="field" {...form.register("buildId")}>
            <option value="">No build</option>
            {builds.filter((build) => build.status === "succeeded").map((build) => (
              <option key={build.id} value={build.id}>{build.id.slice(0, 8)} {build.image}</option>
            ))}
          </select>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="field" type="number" {...form.register("port")} />
            <input className="field" type="number" {...form.register("replicas")} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" {...form.register("expose")} />
            Public HTTPS exposure
          </label>
          <textarea className="field min-h-20" {...form.register("envText")} placeholder={"KEY=value\nFEATURE=true"} />
          <textarea className="field min-h-20" {...form.register("secretsText")} placeholder={"SECRET=value"} />
          {create.error ? <p className="text-sm text-red-200">{create.error.message}</p> : null}
          <button className="btn btn-primary justify-self-start">Deploy</button>
        </form>
      </details>
    </PermissionGate>
  );
}

function ResourceSection({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </label>
  );
}

function LogBlock({ entries }: { entries: string[] }) {
  if (!entries.length) {
    return <div className="log-viewer p-4 text-slate-500">No log lines returned.</div>;
  }
  return (
    <div className="log-viewer p-4">
      {entries.map((entry, index) => (
        <pre key={index} className="whitespace-pre-wrap break-words text-slate-300">
          {entry}
        </pre>
      ))}
    </div>
  );
}

function SmallCode({ value }: { value: string }) {
  return <code className="break-all rounded bg-black/35 px-1.5 py-1 text-xs text-slate-300">{value}</code>;
}
