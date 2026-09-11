import type { ReactNode } from "react";

/**
 * The control host — the story rendered with no wrapping engine at all.
 * Every other host is judged against this one staying identical.
 */
export function DomHost({ children }: { children: ReactNode }) {
  return (
    <div
      data-host="dom"
      style={{ padding: 32, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}
    >
      {children}
    </div>
  );
}
