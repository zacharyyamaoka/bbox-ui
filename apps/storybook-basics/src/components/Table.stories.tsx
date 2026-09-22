import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

/**
 * Stock shadcn `base-nova` Table (components/table.tsx) — the navigator's
 * file listing (fileNavigator.tsx, files-kit) is Name/Size/Modified rows
 * over this part, per docs/CHROME-FILES-SETTINGS-PLAN.md §3 ("folders
 * always first, second click reverses" lives in workspaceModel.ts, not
 * here — this story only proves the stock markup itself).
 */
const meta = {
  title: "Components/Stock/Table",
  tags: ["object:stock", "lane:baseline"],
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FileListing: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Modified</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>CAD Exporter</TableCell>
          <TableCell>—</TableCell>
          <TableCell>Yesterday</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>series_a_pose_pipeline_v7.tldr</TableCell>
          <TableCell>212 KB</TableCell>
          <TableCell>2 hours ago</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("table")).toBeInTheDocument();
    await expect(canvas.getAllByRole("row")).toHaveLength(3);
    await expect(canvas.getByText("series_a_pose_pipeline_v7.tldr")).toBeInTheDocument();
  },
};
