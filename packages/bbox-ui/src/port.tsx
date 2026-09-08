import type { ComponentProps, CSSProperties } from "react";

import { cn } from "./lib/utils";
import {
  PORT_DIAMETERS,
  TEXT_SIZES,
  portFlexDirection,
  portLabelGap,
  wiredInnerPx,
  type PortSize,
  type PortState,
  type PortTextLayout,
  type TextSize,
} from "./layout";

/**
 * Class string for a port dot in a given state. Exported so host adapters
 * can paint the same dot on elements they own (e.g. a React Flow `Handle`).
 */
export function portDotClass(state: PortState): string {
  return cn(
    "relative box-border inline-block shrink-0 rounded-full border-2",
    state === "empty" && "border-foreground bg-transparent",
    state === "default" && "border-muted-foreground bg-muted",
    state === "wired" && "border-foreground bg-transparent",
    state === "received" && "border-bbox-received bg-bbox-received",
  );
}

export interface PortDotProps extends ComponentProps<"span"> {
  state?: PortState;
  size?: PortSize;
}

/**
 * The dot alone — a circle with no opinion about what labels it.
 * The `wired` state paints an inner accent dot inside the hollow ring.
 */
export function PortDot({
  state = "empty",
  size = "md",
  className,
  style,
  ...props
}: PortDotProps) {
  const diameter = PORT_DIAMETERS[size];
  return (
    <span
      data-slot="port-dot"
      data-state={state}
      data-size={size}
      className={cn(portDotClass(state), className)}
      style={{ width: diameter, height: diameter, ...style }}
      {...props}
    >
      {state === "wired" && (
        <span
          data-slot="port-dot-inner"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          style={{ width: wiredInnerPx(size), height: wiredInnerPx(size) }}
        />
      )}
    </span>
  );
}

export interface PortLabelProps extends ComponentProps<"span"> {
  textSize?: TextSize;
}

/**
 * The text slot. A slot the consumer fills — it does not define what goes
 * in it: a name, a value, a CodeMirror mount, anything.
 */
export function PortLabel({
  textSize = "md",
  className,
  style,
  ...props
}: PortLabelProps) {
  return (
    <span
      data-slot="port-label"
      className={cn("whitespace-nowrap leading-tight", className)}
      style={{ fontSize: TEXT_SIZES[textSize], ...style }}
      {...props}
    />
  );
}

export interface PortProps extends ComponentProps<"div"> {
  state?: PortState;
  size?: PortSize;
  textLayout?: PortTextLayout;
  textSize?: TextSize;
}

/**
 * Port = a circle with a text slot. Children fill the slot; pass none and
 * you get the bare dot. `textLayout` places the slot relative to the dot
 * (board labels: Top / Bot / Right / Left / Right (Offset) / Left Offset).
 */
export function Port({
  state = "empty",
  size = "md",
  textLayout = "right",
  textSize = "md",
  className,
  style,
  children,
  ...props
}: PortProps) {
  const flexStyle: CSSProperties = {
    flexDirection: portFlexDirection(textLayout),
    gap: portLabelGap(textLayout),
  };
  return (
    <div
      data-slot="port"
      data-state={state}
      data-text-layout={textLayout}
      className={cn("flex w-fit items-center", className)}
      style={{ ...flexStyle, ...style }}
      {...props}
    >
      <PortDot state={state} size={size} />
      {children != null && <PortLabel textSize={textSize}>{children}</PortLabel>}
    </div>
  );
}
