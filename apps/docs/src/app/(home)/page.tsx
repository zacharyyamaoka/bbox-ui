import Link from "next/link";
import { Icons } from "@/components/icons";
import { CodeBlockCommand } from "@/components/code-block-command";
import { siteConfig } from "@/lib/config";

// NOTE: the stock template ships a 14-line placeholder here ("Build your next
// styled shadcn/ui components" + a bare /docs link). This hero is a stand-in
// written to show what the landing slot can hold — it is NOT part of the
// template, and is the one piece a fork still has to author.

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Icons.logo className="mb-8 size-20 rounded-[18px]" />

      <h1 className="max-w-3xl text-balance text-5xl font-bold tracking-tight md:text-6xl">
        Components for black-box system design
      </h1>

      <p className="text-muted-foreground mt-6 max-w-xl text-balance text-lg">
        {siteConfig.description} Copy-paste components you own, not a library
        you depend on. One presentational core, two canvas hosts.
      </p>

      <div className="mt-10 w-full max-w-xl">
        <CodeBlockCommand command="npx shadcn@latest add zacharyyamaoka/bbox-ui/port" />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/docs/components"
          className="bg-foreground text-background rounded-lg px-5 py-2.5 text-sm font-medium"
        >
          Browse components
        </Link>
        <Link
          href="/docs"
          className="border-border rounded-lg border px-5 py-2.5 text-sm font-medium"
        >
          Documentation
        </Link>
        <a
          href={siteConfig.links.github}
          className="border-border rounded-lg border px-5 py-2.5 text-sm font-medium"
        >
          GitHub
        </a>
      </div>

      <div className="text-muted-foreground mt-16 grid max-w-3xl gap-8 text-left sm:grid-cols-3">
        <div>
          <p className="text-foreground font-medium">Port</p>
          <p className="mt-1 text-sm">
            A circle with a text slot. Four states, six text layouts, three
            diameters.
          </p>
        </div>
        <div>
          <p className="text-foreground font-medium">Block</p>
          <p className="mt-1 text-sm">
            Container, header band, glyph, text slots, chip. The icon rides the
            title rung at 0.9&times;.
          </p>
        </div>
        <div>
          <p className="text-foreground font-medium">Two hosts</p>
          <p className="mt-1 text-sm">
            The same core wrapped for React&nbsp;Flow and tldraw. The core
            imports neither.
          </p>
        </div>
      </div>
    </div>
  );
}
