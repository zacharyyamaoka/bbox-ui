import { LabeledPort } from "@bbox-ui/core";

export default function PortLayouts() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-10 py-10">
      <LabeledPort state="wired" textLayout="top">top</LabeledPort>
      <LabeledPort state="wired" textLayout="bot">bot</LabeledPort>
      <LabeledPort state="wired" textLayout="right">right</LabeledPort>
      <LabeledPort state="wired" textLayout="left">left</LabeledPort>
    </div>
  );
}
