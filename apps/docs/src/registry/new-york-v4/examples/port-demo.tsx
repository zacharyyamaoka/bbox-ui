import { Port } from "@bbox-ui/core";

export default function PortDemo() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-12 py-10">
      <Port state="empty" diameter="md" textLayout="bot">empty</Port>
      <Port state="valueSet" diameter="md" textLayout="bot">default</Port>
      <Port state="wired" diameter="md" textLayout="bot">wired</Port>
      <Port state="received" diameter="md" textLayout="bot">received</Port>
    </div>
  );
}
