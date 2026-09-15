import {
  Block,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  LabeledPort,
} from "@bbox-ui/core";

export default function BlockWithPorts() {
  return (
    <div className="flex items-center justify-center gap-8 py-10">
      <div className="flex flex-col gap-6">
        <LabeledPort state="wired" diameter="md" textLayout="left">image</LabeledPort>
        <LabeledPort state="valueSet" diameter="md" textLayout="left">threshold</LabeledPort>
      </div>
      <Block>
        <BlockHeader>
          <BlockGlyph>🔍</BlockGlyph>
          <BlockTitle>Detect</BlockTitle>
        </BlockHeader>
        <BlockType>dataflow</BlockType>
      </Block>
      <LabeledPort state="wired" diameter="md" textLayout="right">boxes</LabeledPort>
    </div>
  );
}
