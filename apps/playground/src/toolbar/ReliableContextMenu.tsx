import {
  DefaultContextMenuContent,
  TldrawUiMenuContextProvider,
  preventDefault,
  useContainer,
  useDirection,
  useEditor,
  useEditorComponents,
  useGlobalMenuIsOpen,
  useTranslation,
  useValue,
  type TLUiContextMenuProps,
} from "tldraw";
import { ContextMenu as RadixContextMenu } from "radix-ui";
import { memo, useCallback, useEffect, useRef, useState } from "react";

/**
 * tldraw 5.3.2's stock context menu has two owners for "open": Radix and the
 * editor's global menu registry. A canvas pointer-down clears the registry
 * before Radix closes. The stock component then unmounts its portal while the
 * uncontrolled Radix root still believes it is open, so every later
 * right-click is ignored.
 *
 * This is the stock wrapper with one narrow change: Radix is controlled by
 * local state, and an out-of-band registry close also closes that state. The
 * root and its Canvas child stay mounted, which is important because
 * remounting Canvas destroys active Tiptap editor views.
 *
 * WHY a port and not an import: this mechanism was diagnosed and proven in
 * SystemSketch (src/blocks/ui/ReliableContextMenu.tsx); every piece here —
 * the reconciling effect, modal={false}, the Escape handler, the
 * coarse-pointer dismissal window — is load-bearing.
 */
export const ReliableContextMenu = memo(function ReliableContextMenu({
  children,
  disabled = false,
}: TLUiContextMenuProps) {
  const editor = useEditor();
  const msg = useTranslation();
  const { Canvas } = useEditorComponents();

  const menuCanOpen = useValue(
    "context menu can open",
    () => !editor.getInstanceState().isCoarsePointer || editor.isIn("select"),
    [editor],
  );

  const closeMenuRef = useRef<() => void>(() => undefined);
  const preventEscapeFromLosingShapeFocus = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeMenuRef.current();
      editor.getContainer().focus();
    },
    [editor],
  );

  useEffect(() => {
    const body = editor.getContainer().ownerDocument.body;
    return () => {
      body.removeEventListener("keydown", preventEscapeFromLosingShapeFocus, {
        capture: true,
      });
    };
  }, [editor, preventEscapeFromLosingShapeFocus]);

  const suppressDismissUntilRef = useRef(0);
  const onRegisteredOpenChange = useCallback(
    (nextOpen: boolean) => {
      const body = editor.getContainer().ownerDocument.body;
      if (!nextOpen) {
        const onlySelectedShape = editor.getOnlySelectedShape();
        if (
          onlySelectedShape &&
          editor.isShapeOrAncestorLocked(onlySelectedShape)
        ) {
          editor.setSelectedShapes([]);
        }

        editor.timers.requestAnimationFrame(() => {
          body.removeEventListener(
            "keydown",
            preventEscapeFromLosingShapeFocus,
            { capture: true },
          );
        });
        return;
      }

      editor.complete();
      body.addEventListener("keydown", preventEscapeFromLosingShapeFocus, {
        capture: true,
      });

      if (!editor.getInstanceState().isCoarsePointer) return;
      suppressDismissUntilRef.current = Date.now() + 500;

      const selectedShapes = editor.getSelectedShapes();
      const shapesAtPoint = editor.getShapesAtPoint(
        editor.inputs.getCurrentPagePoint(),
      );
      if (
        selectedShapes.length > 0 &&
        shapesAtPoint.some((shape) => selectedShapes.includes(shape))
      ) {
        return;
      }

      const lockedShapes = shapesAtPoint.filter((shape) =>
        editor.isShapeOrAncestorLocked(shape),
      );
      if (lockedShapes.length > 0) {
        editor.select(...lockedShapes.map((shape) => shape.id));
      }
    },
    [editor, preventEscapeFromLosingShapeFocus],
  );

  const [registeredOpen, setRegisteredOpen] = useGlobalMenuIsOpen(
    `context menu-${editor.contextId}`,
    onRegisteredOpenChange,
  );
  const [isOpen, setIsOpen] = useState(false);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen);
      setRegisteredOpen(nextOpen);
    },
    [setRegisteredOpen],
  );

  useEffect(() => {
    closeMenuRef.current = () => handleOpenChange(false);
    return () => {
      closeMenuRef.current = () => undefined;
    };
  }, [handleOpenChange]);

  // Canvas pointer-downs clear tldraw's registry synchronously. Keeping the
  // portal alive until this effect runs lets Radix finish the interaction,
  // then the controlled root is reset without ever remounting Canvas.
  useEffect(() => {
    if (isOpen && !registeredOpen) handleOpenChange(false);
  }, [handleOpenChange, isOpen, registeredOpen]);

  const container = useContainer();
  const dir = useDirection();
  const content = children ?? <DefaultContextMenuContent />;
  const dismissalSuppressed = () => Date.now() < suppressDismissUntilRef.current;

  return (
    <RadixContextMenu.Root
      dir={dir}
      open={isOpen}
      onOpenChange={handleOpenChange}
      modal={false}
    >
      <RadixContextMenu.Trigger
        onContextMenu={menuCanOpen ? undefined : preventDefault}
        dir="ltr"
        disabled={disabled || !menuCanOpen}
      >
        {Canvas ? <Canvas /> : null}
      </RadixContextMenu.Trigger>
      {isOpen && (
        <RadixContextMenu.Portal container={container}>
          <RadixContextMenu.Content
            className="tlui-menu tlui-scrollable"
            data-testid="context-menu"
            aria-label={msg("context-menu.title")}
            alignOffset={-4}
            collisionPadding={4}
            onContextMenu={preventDefault}
            onPointerDownOutside={(event) => {
              if (dismissalSuppressed()) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (dismissalSuppressed()) event.preventDefault();
            }}
            onFocusOutside={(event) => {
              if (dismissalSuppressed()) event.preventDefault();
            }}
          >
            <TldrawUiMenuContextProvider
              type="context-menu"
              sourceId="context-menu"
            >
              {content}
            </TldrawUiMenuContextProvider>
          </RadixContextMenu.Content>
        </RadixContextMenu.Portal>
      )}
    </RadixContextMenu.Root>
  );
});
