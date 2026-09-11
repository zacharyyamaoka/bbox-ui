import { Port } from "@bbox-ui/core";

export default function PortDemo() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-12 py-10">
      <Port state="empty" size="md" textLayout="bot">empty</Port>
      <Port state="default" size="md" textLayout="bot">default</Port>
      <Port state="wired" size="md" textLayout="bot">wired</Port>
      <Port state="received" size="md" textLayout="bot">received</Port>
    </div>
  );
}
