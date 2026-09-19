// src/chrome/overlay.tsx — the one `components.InFrontOfTheCanvas` slot, fanned
// out to whichever kits brought something to paint there.
//
// WHY a fan-out rather than a list in App.tsx: L3 paints a wire's in-flight
// terminal and L4 mounts the chrome bar and the floating toolbar. Both arrive
// through their own directory; neither should have to edit App.tsx to be seen.
import { KITS } from "../shapes/registry";

export function Overlay() {
  return (
    <>
      {KITS.map((kit, index) => (kit.Overlay ? <kit.Overlay key={index} /> : null))}
    </>
  );
}
