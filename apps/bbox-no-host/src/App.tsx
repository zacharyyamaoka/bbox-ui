// apps/bbox-no-host/src/App.tsx — the shell, mounted on nothing.
//
// This is the runner half of the box Zach's dependency diagram calls
// `app/bbox-no-host` (the importable half is `@trunk/shell`). Its whole job is
// to prove the windows are host-shaped rather than tldraw-shaped: if a window
// can be built, reviewed and driven here, with an in-memory fake behind it and
// no canvas at all, then it cannot secretly depend on an engine.
//
// P0 mounts the shell skeleton (I3 — no windows yet). P1 fills it.

import { useMemo, useState } from "react";

import { BboxShell } from "@trunk/shell/BboxShell";
import { createFakeHost } from "@trunk/shell/fakeHost";
import { HOST_CAPABILITIES, type HostCapability } from "@trunk/shell/hostPort";

/**
 * A capability picker, right there in the app.
 *
 * WHY a control and not a URL flag: a variant you can only reach by typing a
 * query string is one Zach has to be told about. Dropping a capability is the
 * thing this app exists to demonstrate — the shell HIDES what a host lacks —
 * so turning one off has to be one click, live, with the result beside it.
 */
export function App() {
  const [enabled, setEnabled] = useState<HostCapability[]>([...HOST_CAPABILITIES]);
  const [connected, setConnected] = useState(true);

  // Re-created when the capability set changes: a host's capabilities are
  // fixed for its lifetime, which is honest — a real host cannot grow one.
  const port = useMemo(() => (connected ? createFakeHost({ capabilities: enabled }) : null), [connected, enabled]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "8px 16px",
          borderBottom: "1px solid var(--border, #e5e5e5)",
          fontSize: 13,
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontWeight: 600 }}>bbox — no host</strong>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={connected} onChange={(e) => setConnected(e.target.checked)} />
          host connected
        </label>
        <span style={{ opacity: 0.5 }}>capabilities:</span>
        {HOST_CAPABILITIES.map((capability) => (
          <label key={capability} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              data-capability={capability}
              checked={enabled.includes(capability)}
              onChange={(e) =>
                setEnabled((current) =>
                  e.target.checked ? [...current, capability] : current.filter((c) => c !== capability),
                )
              }
            />
            {capability}
          </label>
        ))}
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>
        <BboxShell port={port} />
      </main>
    </div>
  );
}
