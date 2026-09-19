import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";

/**
 * The path row (docs/menus/screenshots/05-chrome-bar.png shows the
 * unelided two-level case; a deep board needs the compacted form). The
 * character-budget elision itself (`compactDepthBreadcrumbs`, an L2 model
 * another lane owns) is NOT this file's concern — this gallery shows the
 * primitive it renders onto: plain crumbs, the current page, and the `…`
 * as a REAL menu of hidden levels (MENU-KIT-DESIGN.md §5: "never dropping
 * the last two", "ellipsis on inner span; full name on `title`").
 */
const meta = {
  title: "Basics/Breadcrumb",
  component: Breadcrumb,
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two levels, unelided — the chrome-bar screenshot's actual shape. */
export const Short: Story = {
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">series_a_pose_pipeline_v7</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Main</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
};

/** Every level named, no elision yet — the case a shallow board renders
 *  as-is. */
export const Full: Story = {
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">series_a_pose_pipeline_v7</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Frame 12</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Pipeline Group</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Camera Block</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
};

/**
 * A deep path, compacted: first crumb, `…`, then the last two — "never
 * dropping the last two" (MENU-KIT-DESIGN.md §5). The `…` is a real
 * `DropdownMenu` of every elided level, not inert punctuation — clicking it
 * reveals the four hidden crumbs and each is a real navigation target.
 */
function CompactedDemo() {
  const hidden = ["Frame 12", "Pipeline Group", "Vision Stack", "Calibration"];
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">series_a_pose_pipeline_v7</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" aria-label="Show hidden levels">
                  <BreadcrumbEllipsis />
                </button>
              }
            />
            <DropdownMenuContent align="start">
              {hidden.map((level) => (
                <DropdownMenuItem key={level}>{level}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Vision Block Group</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Camera Block</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export const Compacted: Story = {
  render: () => <CompactedDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const ellipsisTrigger = canvas.getByRole("button", { name: "Show hidden levels" });

    await expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    await userEvent.click(ellipsisTrigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).not.toBeNull();
    });

    // The truthful-rendering rule: nothing hidden by the `…` is lost, every
    // elided level is a real reachable item.
    await expect(body.getByText("Frame 12")).toBeInTheDocument();
    await expect(body.getByText("Calibration")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    });
  },
};

/** A long leaf name truncates visually but keeps the complete value
 *  reachable via `title` — never a silently clipped string
 *  (feedback_truthful_property_rendering: "show an explicit ellipsis and
 *  keep the complete raw value immediately discoverable"). */
export const LongNameTruncates: Story = {
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#" className="max-w-40 truncate" title="series_a_pose_pipeline_v7_full_resolution_calibrated">
            series_a_pose_pipeline_v7_full_resolution_calibrated
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Main</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByText("series_a_pose_pipeline_v7_full_resolution_calibrated");
    await expect(link).toHaveAttribute("title", "series_a_pose_pipeline_v7_full_resolution_calibrated");
  },
};
