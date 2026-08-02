import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PermissionGate, StatusBadge } from "./components";

describe("shared UI components", () => {
  it("renders status badges", () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("hides permission gated controls without the required scope", () => {
    render(
      <MemoryRouter>
        <PermissionGate permissions={["apps:read"]} require="apps:create">
          <button>Create app</button>
        </PermissionGate>
      </MemoryRouter>,
    );
    expect(screen.queryByText("Create app")).not.toBeInTheDocument();
  });
});
