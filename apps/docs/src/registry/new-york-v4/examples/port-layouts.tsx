import { Port } from "@bbox-ui/core";

export default function PortLayouts() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-10 py-10">
      <Port state="wired" textLayout="top">top</Port>
      <Port state="wired" textLayout="bot">bot</Port>
      <Port state="wired" textLayout="right">right</Port>
      <Port state="wired" textLayout="left">left</Port>
    </div>
  );
}
