function extractLegacyDocBlocks(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "paragraph") return block.text;
      if (block.type !== "table") return "";

      return block.rows
        .map((row) =>
          row.cells
            .map((cell) => {
              if (cell.blocks?.length) {
                return extractLegacyDocBlocks(cell.blocks).join("\n");
              }
              return cell.paragraphs.map((paragraph) => paragraph.text).join("\n");
            })
            .join("\t"),
        )
        .join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

export async function extractOfficeText(file, extension) {
  if (extension === "doc") {
    const { parseMsDoc } = await import("@file-viewer/doc");
    const parsed = parseMsDoc(await file.arrayBuffer());
    return extractLegacyDocBlocks(parsed.blocks);
  }

  const fileType = extension === "htm" ? "html" : extension;
  if (!["rtf", "odt", "pptx", "xlsx", "html"].includes(fileType)) {
    throw new Error(`Unsupported document format: .${extension}`);
  }

  const { OfficeParser } = await import("officeparser/slim");
  const parsed = await OfficeParser.parseOffice(file, {
    fileType,
    extractAttachments: false,
    decompressionLimits: {
      maxUncompressedBytes: 50 * 1024 * 1024,
      maxZipEntries: 1000,
      maxTableCells: 100000,
    },
  });
  const result = await parsed.to("text");
  return result.value;
}
