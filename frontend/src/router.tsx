import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./ui/shell";
import {
  AppDetailPage,
  AppsPage,
  BuildDetailPage,
  CreateAppPage,
  DashboardPage,
  DeploymentDetailPage,
  IncidentDetailPage,
  IncidentsPage,
  LoginPage,
  RcaRunPage,
  SettingsPage,
  TelemetryPage,
} from "./ui/pages";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <AppShell />,
    errorElement: <AppShell routeError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "apps", element: <AppsPage /> },
      { path: "apps/new", element: <CreateAppPage /> },
      { path: "apps/:appId", element: <AppDetailPage /> },
      { path: "apps/:appId/builds/:buildId", element: <BuildDetailPage /> },
      {
        path: "apps/:appId/deployments/:deploymentId",
        element: <DeploymentDetailPage />,
      },
      {
        path: "apps/:appId/deployments/:deploymentId/telemetry",
        element: <TelemetryPage />,
      },
      { path: "incidents", element: <IncidentsPage /> },
      { path: "incidents/:incidentId", element: <IncidentDetailPage /> },
      { path: "rca-runs/:runId", element: <RcaRunPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
