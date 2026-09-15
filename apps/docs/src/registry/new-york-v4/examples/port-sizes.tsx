import { LabeledPort } from "@bbox-ui/core";

export default function PortSizes() {
  return (
    <div className="flex flex-wrap items-end justify-center gap-12 py-10">
      <LabeledPort state="wired" diameter="sm" textLayout="bot">sm 14</LabeledPort>
      <LabeledPort state="wired" diameter="md" textLayout="bot">md 25</LabeledPort>
      <LabeledPort state="wired" diameter="lg" textLayout="bot">lg 36</LabeledPort>
    </div>
  );
}
