import { Port } from "@bbox-ui/core";

export default function PortSizes() {
  return (
    <div className="flex flex-wrap items-end justify-center gap-12 py-10">
      <Port state="wired" diameter="sm" textLayout="bot">sm 14</Port>
      <Port state="wired" diameter="md" textLayout="bot">md 25</Port>
      <Port state="wired" diameter="lg" textLayout="bot">lg 36</Port>
    </div>
  );
}
