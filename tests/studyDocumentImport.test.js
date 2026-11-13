import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractOfficeText } from "../src/studyDocumentImport.js";

async function createOfficeFile(name, entries) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new File([bytes], name);
}

test("RTF documents are converted to plain text", async () => {
  const file = new File(["{\\rtf1\\ansi Hello World}"], "notes.rtf");
  assert.equal(await extractOfficeText(file, "rtf"), "Hello World");
});

test("HTML extraction includes visible text without script content", async () => {
  const file = new File(
    ["<html><body><h1>Cell structure</h1><p>Text only.</p><script>hidden</script></body></html>"],
    "notes.html",
  );
  const text = await extractOfficeText(file, "html");
  assert.match(text, /Cell structure/);
  assert.match(text, /Text only\./);
  assert.doesNotMatch(text, /hidden/);
});

test("OpenDocument text is extracted from content.xml", async () => {
  const file = await createOfficeFile("notes.odt", {
    mimetype: "application/vnd.oasis.opendocument.text",
    "content.xml": `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>OpenDocument text.</text:p></office:text></office:body></office:document-content>`,
  });
  const text = await extractOfficeText(file, "odt");
  assert.match(text, /OpenDocument text\./);
});

test("PowerPoint slide text is extracted", async () => {
  const file = await createOfficeFile("slides.pptx", {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    "ppt/presentation.xml": `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Presentation text.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  });
  const text = await extractOfficeText(file, "pptx");
  assert.match(text, /Presentation text\./);
});

test("Excel cell text is extracted", async () => {
  const file = await createOfficeFile("sheet.xlsx", {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Spreadsheet text.</t></is></c></row></sheetData></worksheet>`,
  });
  const text = await extractOfficeText(file, "xlsx");
  assert.match(text, /Spreadsheet text\./);
});

test("legacy DOC parser errors are not hidden", async () => {
  const file = new File(["not a Word document"], "broken.doc");
  await assert.rejects(() => extractOfficeText(file, "doc"));
});
