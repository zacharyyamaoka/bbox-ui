import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Badge } from "@trunk/components/badge";

import "./app.css";

// Placeholder only (B-DEPS skeleton). L-RF-HOST replaces this with the shell
// over simple-reactflow-whiteboard. It renders one trunk component so the
// `@trunk` alias and the trunk's Tailwind scan are exercised from day one.

const root = document.getElementById("root");
if (!root) throw new Error("no #root in index.html");

createRoot(root).render(
  <StrictMode>
    <main data-slot="bbox-reactflow-placeholder" className="flex h-full items-center justify-center gap-2 text-sm">
      <Badge variant="outline">bbox · React Flow host</Badge>
      <span className="text-muted-foreground">placeholder: the host lands in L-RF-HOST</span>
    </main>
  </StrictMode>,
);
