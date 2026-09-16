import { LabeledPort } from "@bbox-ui/core";

export default function PortDemo() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-12 py-10">
      <LabeledPort state="empty" diameter="md" textLayout="bot">empty</LabeledPort>
      <LabeledPort state="valueSet" diameter="md" textLayout="bot">default</LabeledPort>
      <LabeledPort state="wired" diameter="md" textLayout="bot">wired</LabeledPort>
      <LabeledPort state="received" diameter="md" textLayout="bot">received</LabeledPort>
    </div>
  );
}
