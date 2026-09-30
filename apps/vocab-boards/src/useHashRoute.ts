import { useEffect, useState } from "react";
import { parseHash, type Route } from "./state";

/** Reads `location.hash` reactively; navigation elsewhere in the app is a plain
 *  `location.hash = ...` or an ordinary `<a href="#/...">`, exactly as in the
 *  reference viewer (/home/bam/pyblocks/src/goldens/useHashRoute.ts). Real
 *  anchors, so middle-click and Back work without a router. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
