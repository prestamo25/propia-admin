// Minimal .xlsx writer — enough for one flat sheet: a bold frozen header, sized
// columns, an autofilter, and text-only cells.
//
// Text-only is the point. A CSV opened in Excel turns "522224692230" into
// 5.22225E+11 and eats leading zeros; forcing every cell to inlineStr keeps
// phone numbers exactly as they left the database.
//
// An .xlsx is a ZIP of XML parts. Both are built by hand here rather than
// pulling a spreadsheet library (and its dependency tree) into an admin that
// otherwise ships five packages.

import { deflateRawSync } from "node:zlib";

export type Column = { header: string; width: number };

export function buildXlsx(columns: Column[], rows: string[][]): Buffer {
  return zip([
    { name: "[Content_Types].xml", data: buf(CONTENT_TYPES) },
    { name: "_rels/.rels", data: buf(ROOT_RELS) },
    { name: "xl/workbook.xml", data: buf(WORKBOOK) },
    { name: "xl/_rels/workbook.xml.rels", data: buf(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: buf(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: buf(sheetXml(columns, rows)) },
  ]);
}

// --- SpreadsheetML ----------------------------------------------------------

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

// Style ids from STYLES below: 0 = body, 1 = header.
const BODY = 0;
const HEADER = 1;

function sheetXml(columns: Column[], rows: string[][]): string {
  const ref = `A1:${colName(columns.length - 1)}${rows.length + 1}`;

  const cols = columns
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`,
    )
    .join("");

  const header = row(1, columns.map((c) => c.header), HEADER);
  const body = rows.map((cells, i) => row(i + 2, cells, BODY)).join("");

  return (
    `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${ref}"/>` +
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="${ref}"/>` +
    // Every cell is deliberately text, so suppress the green "number stored as
    // text" triangle Excel would otherwise put on all 600-odd phone numbers.
    `<ignoredErrors><ignoredError sqref="${ref}" numberStoredAsText="1"/></ignoredErrors>` +
    `</worksheet>`
  );
}

function row(r: number, cells: string[], style: number): string {
  const xml = cells
    .map((value, c) =>
      // An omitted cell is a blank cell — cheaper than writing an empty one.
      value === ""
        ? ""
        : `<c r="${colName(c)}${r}" s="${style}" t="inlineStr"><is>` +
          `<t xml:space="preserve">${xmlText(value)}</t></is></c>`,
    )
    .join("");
  return `<row r="${r}">${xml}</row>`;
}

// 0 → A, 25 → Z, 26 → AA.
function colName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

// Drop the control characters XML 1.0 forbids outright, then escape the rest.
// Broker names are typed on a phone keyboard, so both cases turn up in practice.
function xmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CONTENT_TYPES =
  `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK =
  `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<sheets><sheet name="Brokers" sheetId="1" r:id="rId1"/></sheets>` +
  `</workbook>`;

const WORKBOOK_RELS =
  `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

// Colors are literal RGB, never theme-indexed — a theme reference would need an
// xl/theme/theme1.xml part we don't ship, and Excel repairs the file without it.
const STYLES =
  `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2">` +
  `<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>` +
  `</fonts>` +
  // Excel expects "none" and "gray125" to occupy the first two slots.
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F7"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// --- ZIP --------------------------------------------------------------------

function buf(s: string): Buffer {
  return Buffer.from(s, "utf8");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// A fixed DOS timestamp (2020-01-01) keeps the same input producing the same
// bytes, which makes the output diffable when something looks wrong.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    name.copy(local, 30);
    chunks.push(local, compressed);

    const dir = Buffer.alloc(46 + name.length);
    dir.writeUInt32LE(0x02014b50, 0); // central directory header
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0, 8); // flags
    dir.writeUInt16LE(8, 10); // deflate
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30); // extra
    dir.writeUInt16LE(0, 32); // comment
    dir.writeUInt16LE(0, 34); // disk number
    dir.writeUInt16LE(0, 36); // internal attrs
    dir.writeUInt32LE(0, 38); // external attrs
    dir.writeUInt32LE(offset, 42);
    name.copy(dir, 46);
    central.push(dir);

    offset += local.length + compressed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, directory, end]);
}
