import {
  Block,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  Port,
} from "@bbox-ui/core";

export default function BlockWithPorts() {
  return (
    <div className="flex items-center justify-center gap-8 py-10">
      <div className="flex flex-col gap-6">
        <Port state="wired" diameter="md" textLayout="left">image</Port>
        <Port state="valueSet" diameter="md" textLayout="left">threshold</Port>
      </div>
      <Block>
        <BlockHeader>
          <BlockGlyph>🔍</BlockGlyph>
          <BlockTitle>Detect</BlockTitle>
        </BlockHeader>
        <BlockType>dataflow</BlockType>
      </Block>
      <Port state="wired" diameter="md" textLayout="right">boxes</Port>
    </div>
  );
}
