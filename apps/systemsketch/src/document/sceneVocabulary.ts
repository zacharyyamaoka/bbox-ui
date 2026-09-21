// src/document/sceneVocabulary.ts — what this board's ports DECLARE, in the
// shape `@trunk/scene` asks for it.
//
// The linter and the connection judge both take a `PortTypeOf` resolver and
// both deliberately abstain when it is missing ("undefined = unknown, no
// judgement" — `scene/model.ts`'s convention). Until ruling 3 neither surface
// supplied one, and for a good reason recorded in `chrome/problems.ts`: wiring
// types in would silently MINT the type ontology from a menu lane, when what a
// type IS had no product decision behind it.
//
// Ruling 3 is that decision, and it is why this file exists now. The user picks
// the rung: at `whiteboard` and `guided` the level withholds this resolver
// outright (`validationLevel.ts`'s `vocabularyForLevel`, `types: "off"`), so
// supplying it changes NOTHING at either — measured, not assumed: the default
// level is `guided`. At `typed` an undeclared type is a wildcard, and at
// `strict` it is itself the error. Nothing here decides that; it only answers
// what the board says, which is a fact about the document.
//
// WHY here and not in `chrome/problems.ts` beside its `portsOfScene` twin: the
// wire gesture (`shapes/wire/`) needs the identical answer, and a judge and a
// linter that disagreed about what a port declares would refuse a cable and
// then report nothing about it. `document/` is the layer both already share.
import { portTypeOfDeclaration } from "@trunk/scene/portDeclaration";
import type { PortTypeOf } from "@trunk/scene/model";

import type { DocNodeData, DocumentScene } from "./sceneFromStore";

/**
 * The declared datatype of a port, as a one-tag vocabulary, or `undefined`
 * when the board states none.
 *
 * Both kinds answer from their ONE declaration line (ruling 8 — there is no
 * second field to read): a block's ports are parsed into `data.portTypes` by
 * the projection, and a floating `ss-port` carries its whole line verbatim.
 * A code cell or a region declares no ports at all, so it declares no types.
 */
export function portTypesOfScene(scene: DocumentScene): PortTypeOf {
  const byId = new Map<string, DocNodeData>();
  for (const node of scene.nodes) byId.set(node.id, node.data);
  return ({ nodeId, portId }) => {
    const data = byId.get(nodeId);
    if (!data) return undefined;
    const declared = data.kind === "port" ? portTypeOfDeclaration(data.declaration ?? "") : data.portTypes?.[portId];
    return declared === undefined ? undefined : [declared];
  };
}
