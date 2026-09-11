import {
  Block,
  BlockChip,
  BlockDescription,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
} from "@bbox-ui/core";

export default function BlockDemo() {
  return (
    <div className="flex justify-center py-10">
      <Block>
        <BlockHeader>
          <BlockGlyph>🔍</BlockGlyph>
          <BlockTitle>Detect</BlockTitle>
          <BlockChip>Draft 1</BlockChip>
        </BlockHeader>
        <BlockDescription>blackbox modelling</BlockDescription>
        <BlockType>dataflow</BlockType>
      </Block>
    </div>
  );
}
