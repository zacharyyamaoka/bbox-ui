import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

/**
 * What's New — a changelog for the stories themselves, DERIVED from git
 * rather than hand-tagged.
 *
 * Zach, 2026-09-17: "I also wonder if the branches should start to tag the
 * stories or something so I can quickly sort and see the ones that have
 * recently been edited, so I can provide feedback?" A hand-applied `new`
 * tag is right the day it is written and wrong a week later, and nobody
 * prunes it — so this reads `whats-new.generated.json`
 * (docs/build_whats_new.mjs, wired as `pnpm whats-new`) instead: one entry
 * per commit that touched a story file, newest first, with the commit
 * SUBJECT as the heading (it carries the *why* a tag cannot) and a real
 * link into every story that commit changed.
 *
 * WHY `import.meta.glob` and not a static `import data from
 * "./whats-new.generated.json"`: the JSON is generated and gitignored (see
 * the root .gitignore), so a plain static import would be a build-time
 * error the moment the file is missing — exactly the "absent" case this
 * story has to survive without crashing. A glob with zero filesystem
 * matches is not an error; Vite resolves it to an empty object, which is
 * what lets a fresh clone or an isolated lane that never ran the generator
 * still render (the `Empty` story below asserts this directly, not just by
 * inspection).
 *
 * WHY the `data` prop exists at all instead of `WhatsNewView` reading the
 * module import directly: it is what makes `Empty` (JSON absent) and
 * `MalformedData` (JSON present but the wrong shape — an "old" schema, or a
 * write that got interrupted) into real, assertable stories rather than
 * claims that can only be exercised by deleting a file by hand.
 *
 * TITLE / findability: "What's New" is a standalone top-level entry (no
 * `/`), deliberately NOT nested under an existing group — Zach's ask was to
 * see recent edits at a glance, not hunt inside Blocks/Ports/Trace for
 * them. No `storySort` is configured in `.storybook/preview.tsx` this
 * round (a concurrent lane owns that file), so this sorts alphabetically
 * with everything else and lands near the bottom of the sidebar, after
 * "Trace" — pinning it to the top is a one-line `storySort` follow-up, not
 * done here. Tag injection into individual stories (the other half of
 * Zach's ask) is the same kind of follow-up, same reason.
 */

type WhatsNewStory = {
  exportName: string;
  name: string;
  title: string;
  id: string;
  url: string;
};

type WhatsNewUnresolved = { file: string; reason: string };

type WhatsNewCommit = {
  sha: string;
  shortSha: string;
  subject: string;
  date: string;
  author: string;
  stories: WhatsNewStory[];
  unresolved: WhatsNewUnresolved[];
};

type WhatsNewData = {
  generatedAt: string;
  sinceDescription: string;
  headSha: string;
  headShortSha: string;
  commits: WhatsNewCommit[];
};

function isWhatsNewData(value: unknown): value is WhatsNewData {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as { commits?: unknown }).commits) &&
    typeof (value as { sinceDescription?: unknown }).sinceDescription === "string"
  );
}

const modules = import.meta.glob<{ default: unknown }>("./whats-new.generated.json", { eager: true });
const generated: unknown = modules["./whats-new.generated.json"]?.default;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function EmptyState({ reason }: { reason: string }) {
  return (
    <div
      data-testid="whats-new-empty"
      style={{
        maxWidth: 480,
        padding: 24,
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-lg)",
        color: "var(--muted-foreground)",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <p style={{ margin: "0 0 8px", color: "var(--foreground)", fontWeight: 600 }}>Nothing to show yet</p>
      <p style={{ margin: "0 0 8px" }}>{reason}</p>
      <p style={{ margin: 0 }}>
        Run <code>pnpm whats-new</code> from <code>apps/storybook-basics</code> to generate it from git — see{" "}
        <code>docs/build_whats_new.mjs</code>.
      </p>
    </div>
  );
}

function WhatsNewView({ data }: { data: unknown }) {
  if (!isWhatsNewData(data)) {
    return (
      <EmptyState
        reason={
          data === undefined
            ? "whats-new.generated.json has not been generated in this checkout."
            : "whats-new.generated.json exists but is not shaped like a What's New payload (an old or interrupted write)."
        }
      />
    );
  }
  if (data.commits.length === 0) {
    return <EmptyState reason={`No commits touched a story file ${data.sinceDescription}.`} />;
  }

  return (
    <div data-testid="whats-new-root" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720, padding: 24 }}>
      <header>
        <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600, color: "var(--foreground)" }}>What&rsquo;s New</h1>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
          {data.sinceDescription} · through <code>{data.headShortSha}</code>
        </p>
      </header>

      {data.commits.map((commit) => (
        <article
          key={commit.sha}
          data-testid={`commit-${commit.shortSha}`}
          style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{commit.subject}</h2>
          <p style={{ margin: "4px 0 12px", fontSize: 11, color: "var(--muted-foreground)" }}>
            <code>{commit.shortSha}</code> · {formatDate(commit.date)} · {commit.author}
          </p>

          {commit.stories.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {commit.stories.map((story) => (
                // WHY the key/testid is (commit, story) and not story.id
                // alone: the same story file — and so the same resolved
                // story id — can legitimately be touched by more than one
                // recent commit (ValuePreset.stories.tsx is, in this repo's
                // own history). Keying by id alone would collide two <li>s
                // onto one React key and make `getByTestId` ambiguous.
                <li key={`${commit.sha}-${story.id}`}>
                  {/* target="_top": this story renders inside Storybook's own
                      preview iframe, so a plain in-frame navigation would
                      only replace the iframe's content and strand the
                      sidebar/URL on the What's New story. _top replaces the
                      whole Storybook window instead, which is what "a real
                      link that navigates Storybook to it" means. */}
                  <a
                    href={story.url}
                    target="_top"
                    data-testid={`story-link-${commit.shortSha}-${story.id}`}
                    style={{ fontSize: 13, color: "var(--foreground)", textDecoration: "underline", textUnderlineOffset: 2 }}
                  >
                    {story.title} · {story.name}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {commit.unresolved.length > 0 && (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--destructive)" }}>
              could not resolve: {commit.unresolved.map((u) => `${u.file} (${u.reason})`).join("; ")}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

const meta = {
  title: "What's New",
  render: (args) => <WhatsNewView data={args.data} />,
  args: { data: generated },
} satisfies Meta<typeof WhatsNewView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Whatever `pnpm whats-new` last generated for this checkout. In a fresh
 * clone or an isolated lane that never ran the generator this renders the
 * same empty state as `Empty` below — see the play function. */
export const Timeline: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    if (!isWhatsNewData(generated) || generated.commits.length === 0) {
      await expect(canvas.getByTestId("whats-new-empty")).toBeInTheDocument();
      return;
    }
    await expect(canvas.getByTestId("whats-new-root")).toBeInTheDocument();
    await expect(canvas.getByText(generated.commits[0].subject)).toBeInTheDocument();

    const totalLinks = generated.commits.reduce((n, c) => n + c.stories.length, 0);
    await expect(totalLinks).toBeGreaterThanOrEqual(3);
    for (const commit of generated.commits) {
      for (const story of commit.stories) {
        const link = canvas.getByTestId(`story-link-${commit.shortSha}-${story.id}`);
        await expect(link).toHaveAttribute("href", `/?path=/story/${story.id}`);
        await expect(link).toHaveAttribute("target", "_top");
      }
    }
  },
};

/** JSON absent — the state a fresh clone or an un-run isolated lane is in.
 * Proves the empty state renders rather than crashing (R4), by actually
 * passing `undefined` rather than only asserting it by inspection. */
export const Empty: Story = {
  args: { data: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("whats-new-empty")).toBeInTheDocument();
    await expect(canvas.getByText(/has not been generated/)).toBeInTheDocument();
  },
};

/** JSON present but the wrong shape — an old schema, or a write that got
 * interrupted mid-way. Same empty-state path as `Empty`, different reason
 * text, so a malformed file degrades exactly as gracefully as a missing
 * one instead of throwing while destructuring `.commits`. */
export const MalformedData: Story = {
  args: { data: { oldField: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("whats-new-empty")).toBeInTheDocument();
    await expect(canvas.getByText(/not shaped like a What's New payload/)).toBeInTheDocument();
  },
};

/** A fixed fixture (not the live-generated file, which changes every run)
 * so the commit-card rendering itself — subject as heading, sha/date/
 * author line, per-story links, an unresolved file surfaced rather than
 * hidden — has one stable shape under test. */
export const FixtureExample: Story = {
  args: {
    data: {
      generatedAt: "2026-09-17T00:00:00.000Z",
      sinceDescription: "since branch diverged from main (d7b90df)",
      headSha: "fe6bb6b6c3785cb93a27defba06139faf9924639",
      headShortSha: "fe6bb6b",
      commits: [
        {
          sha: "fe6bb6b6c3785cb93a27defba06139faf9924639",
          shortSha: "fe6bb6b",
          subject: "Bring the skin system into the trunk (Tranche 2: block, badge, port, trace, codeEditor)",
          date: "2026-09-17T20:03:16-07:00",
          author: "Zach Yamaoka",
          stories: [
            {
              exportName: "AllComponents",
              name: "All Components",
              title: "Styles",
              id: "styles--all-components",
              url: "/?path=/story/styles--all-components",
            },
          ],
          unresolved: [],
        },
        {
          sha: "0000000000000000000000000000000000000000",
          shortSha: "0000000",
          subject: "A hypothetical commit touching a story file that broke the CSF3 shape this parser expects",
          date: "2026-09-16T12:00:00-07:00",
          author: "Someone",
          stories: [],
          unresolved: [{ file: "apps/storybook-basics/src/stories/Hypothetical.stories.tsx", reason: "no `const meta` declaration found" }],
        },
      ],
    } satisfies WhatsNewData,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("commit-fe6bb6b")).toBeInTheDocument();
    await expect(canvas.getByTestId("story-link-fe6bb6b-styles--all-components")).toBeInTheDocument();
    await expect(canvas.getByText(/could not resolve/)).toBeInTheDocument();
  },
};
