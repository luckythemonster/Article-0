/**
 * Generates `docs/TYPE_REFERENCE.md` from the TypeScript sources under `src/`.
 *
 * Walks every non-test `.ts` file with the compiler's parser and emits every enum,
 * class, interface, type alias, and `as const` constant it finds, along with the
 * doc comment attached to each. Run it after changing a declaration so the
 * reference does not drift:
 *
 *     npm run docs:types
 */
import * as ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import { collapse, truncate } from "./text";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "docs", "TYPE_REFERENCE.md");

type Kind = "enum" | "class" | "interface" | "type" | "const";

interface Member {
  kind: "member" | "prop" | "method" | "ctor" | "get" | "set";
  name: string;
  text: string;
  doc: string;
  optional: boolean;
  private: boolean;
}

interface Decl {
  file: string;
  line: number;
  kind: Kind;
  name: string;
  exported: boolean;
  doc: string;
  heritage: string;
  typeParams: string;
  members: Member[];
  aliasText?: string;
  /** A doc block separated from the declaration by a blank line — a file header, by convention. */
  moduleDoc?: string;
}

/** Source directories, in the order they appear in the document. */
const AREAS: { dir: string; title: string; blurb: string }[] = [
  {
    dir: "systems",
    title: "Systems",
    blurb:
      "Headless simulation and rules. Nothing here touches Phaser or the DOM, which is why " +
      "these are the types the unit tests drive directly.",
  },
  {
    dir: "entities",
    title: "Entities",
    blurb:
      "Actors and props that own a sprite plus the behaviour attached to it. Entities wrap the " +
      "headless cores from `systems/` and add the Phaser display objects.",
  },
  {
    dir: "map",
    title: "Map",
    blurb:
      "The `edplay` file format, its in-memory game-side counterpart, and the generators that " +
      "append levels the shipped map does not contain.",
  },
  {
    dir: "scenes",
    title: "Scenes",
    blurb: "Phaser scenes and the per-scene helpers `GameScene` delegates to.",
  },
  {
    dir: "ui",
    title: "UI",
    blurb:
      "HUD widgets and DOM overlays. Phaser-drawn HUD pieces and DOM-drawn full-screen views " +
      "both live here.",
  },
  { dir: "tools", title: "Tools", blurb: "Offline build tooling — currently the sprite-collider generator." },
  { dir: "testing", title: "Testing", blurb: "Test doubles shared across the suite." },
  { dir: "", title: "Entry points", blurb: "Top-level bootstrap modules." },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts"))
      out.push(full);
  }
  return out;
}

function strip(block: string): string {
  return block
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\* ?/, "").trimEnd())
    // Headings inside a doc comment would otherwise outrank the entry they belong to.
    .map((l) => l.replace(/^#{1,6} /, "##### "))
    .join("\n")
    .replace(/\{@link\s+([^}|]+?)\s*(?:\|\s*([^}]+?))?\s*\}/g, (_, target: string, label?: string) =>
      label ? label : "`" + target + "`",
    )
    .trim();
}

/**
 * The last `/** ... *\/` block in a node's leading trivia.
 *
 * A block separated from the declaration by a blank line documents the *file*, not the
 * declaration — that is the TSDoc convention and this repo follows it — so it comes back
 * as `moduleDoc` instead.
 */
function jsdoc(node: ts.Node, sf: ts.SourceFile): { doc: string; moduleDoc: string } {
  const trivia = node.getFullText(sf).slice(0, node.getLeadingTriviaWidth(sf));
  const blocks = trivia.match(/\/\*\*[\s\S]*?\*\//g);
  if (!blocks?.length) return { doc: "", moduleDoc: "" };
  const last = blocks[blocks.length - 1];
  const detached = /\n[ \t]*\n[ \t]*$/.test(trivia.slice(trivia.lastIndexOf(last) + last.length));
  return detached ? { doc: "", moduleDoc: strip(last) } : { doc: strip(last), moduleDoc: "" };
}

const docOf = (node: ts.Node, sf: ts.SourceFile) => jsdoc(node, sf).doc;

function modifiers(node: ts.Node): string[] {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return (mods ?? []).map((m) => m.getText());
}

const isExported = (node: ts.Node) => modifiers(node).includes("export");

/** One-line member text: no body, no long initialiser. */
function signature(node: ts.Node, sf: ts.SourceFile): string {
  let text = node.getText(sf);
  const body = (node as { body?: ts.Node }).body;
  if (body) text = text.slice(0, body.getStart(sf) - node.getStart(sf)).trimEnd();
  else if (ts.isPropertyDeclaration(node) && node.initializer) {
    const init = node.initializer.getText(sf);
    if (init.length > 80 || init.includes("\n"))
      text = text.slice(0, node.initializer.getStart(sf) - node.getStart(sf)) + "…";
  }
  return collapse(text).replace(/;$/, "");
}

function parse(file: string): Decl[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const rel = path.relative(ROOT, file);
  const found: Decl[] = [];

  const base = (node: ts.Node, kind: Kind, name: string): Decl => ({
    file: rel,
    line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    kind,
    name,
    exported: isExported(node),
    doc: jsdoc(node, sf).doc,
    moduleDoc: jsdoc(node, sf).moduleDoc,
    heritage: "",
    typeParams: "",
    members: [],
  });

  const params = (node: { typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration> }) =>
    node.typeParameters ? `<${node.typeParameters.map((t) => t.getText(sf)).join(", ")}>` : "";

  const visit = (node: ts.Node) => {
    if (ts.isEnumDeclaration(node)) {
      const d = base(node, "enum", node.name.text);
      // Resolve implicit ordinals so the table shows the value the enum actually has.
      let next = 0;
      for (const m of node.members) {
        const explicit = m.initializer?.getText(sf);
        let value: string;
        if (explicit === undefined) {
          value = String(next);
          next += 1;
        } else {
          value = collapse(explicit);
          const n = Number(value);
          next = Number.isFinite(n) ? n + 1 : next;
        }
        d.members.push({
          kind: "member",
          name: m.name.getText(sf),
          text: value,
          doc: docOf(m, sf),
          optional: explicit === undefined,
          private: false,
        });
      }
      found.push(d);
    } else if (ts.isClassDeclaration(node) && node.name) {
      const d = base(node, "class", node.name.text);
      d.heritage = collapse((node.heritageClauses ?? []).map((h) => h.getText(sf)).join(" "));
      d.typeParams = params(node);
      for (const m of node.members) {
        const kind = ts.isConstructorDeclaration(m)
          ? "ctor"
          : ts.isMethodDeclaration(m)
            ? "method"
            : ts.isGetAccessor(m)
              ? "get"
              : ts.isSetAccessor(m)
                ? "set"
                : ts.isPropertyDeclaration(m)
                  ? "prop"
                  : undefined;
        if (!kind) continue;
        const name = kind === "ctor" ? "constructor" : (m.name?.getText(sf) ?? "?");
        d.members.push({
          kind,
          name,
          text: signature(m, sf),
          doc: docOf(m, sf),
          optional: !!(m as { questionToken?: ts.Node }).questionToken,
          private: modifiers(m).includes("private") || name.startsWith("#"),
        });
      }
      found.push(d);
    } else if (ts.isInterfaceDeclaration(node)) {
      const d = base(node, "interface", node.name.text);
      d.heritage = collapse((node.heritageClauses ?? []).map((h) => h.getText(sf)).join(" "));
      d.typeParams = params(node);
      d.members = node.members.map((m) => ({
        kind: "prop",
        name: (m as { name?: ts.Node }).name?.getText(sf) ?? "[index]",
        text: signature(m, sf),
        doc: docOf(m, sf),
        optional: !!(m as { questionToken?: ts.Node }).questionToken,
        private: false,
      }));
      found.push(d);
    } else if (ts.isTypeAliasDeclaration(node)) {
      const d = base(node, "type", node.name.text);
      d.typeParams = params(node);
      d.aliasText = collapse(node.type.getText(sf));
      found.push(d);
    } else if (ts.isVariableStatement(node)) {
      for (const v of node.declarationList.declarations) {
        const init = v.initializer;
        if (!init || !ts.isAsExpression(init) || init.type.getText(sf) !== "const") continue;
        const inner = init.expression;
        if (!ts.isObjectLiteralExpression(inner) && !ts.isArrayLiteralExpression(inner)) continue;
        const d = base(node, "const", v.name.getText(sf));
        d.aliasText = truncate(collapse(inner.getText(sf)), 600);
        if (ts.isObjectLiteralExpression(inner)) {
          for (const p of inner.properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            d.members.push({
              kind: "member",
              name: p.name.getText(sf),
              text: truncate(collapse(p.initializer.getText(sf)), 120),
              doc: docOf(p, sf),
              optional: false,
              private: false,
            });
          }
        }
        found.push(d);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

// --- rendering ---------------------------------------------------------------

/** Stable per-declaration anchors, assigned once so headings and the index agree. */
function assignAnchors(decls: Decl[]): Map<Decl, string> {
  const taken = new Set<string>();
  const map = new Map<Decl, string>();
  for (const d of decls) {
    const slug = `${d.kind}-${d.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let anchor = slug;
    for (let i = 2; taken.has(anchor); i += 1) anchor = `${slug}-${i}`;
    taken.add(anchor);
    map.set(d, anchor);
  }
  return map;
}

/** Markdown table cells cannot hold raw pipes or newlines. */
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
/** Inline code for a table cell: backticks and pipes both need handling. */
const code = (s: string) => "`" + s.replace(/`/g, "").replace(/\|/g, "\\|") + "`";

const KIND_LABEL: Record<Kind, string> = {
  enum: "enum",
  class: "class",
  interface: "interface",
  type: "type",
  const: "const",
};

function areaOf(file: string): string {
  const parts = file.split("/");
  return parts.length > 2 ? parts[1] : "";
}

function renderDecl(d: Decl, anchor: string, out: string[]): void {
  out.push(`<a id="${anchor}"></a>`);
  out.push("");
  const suffix = d.exported ? "" : " *(module-private)*";
  out.push(`#### ${code(d.name + d.typeParams)} — ${KIND_LABEL[d.kind]}${suffix}`);
  out.push("");
  out.push(`\`${d.file}:${d.line}\`${d.heritage ? ` · ${code(d.heritage)}` : ""}`);
  out.push("");
  if (d.moduleDoc) {
    out.push(`**Module note** — the header comment on \`${d.file}\`, which this declaration heads:`);
    out.push("");
    out.push(d.moduleDoc);
    out.push("");
  }
  if (d.doc) {
    out.push(d.doc);
    out.push("");
  }

  if (d.kind === "type") {
    out.push("```ts");
    out.push(`type ${d.name}${d.typeParams} = ${d.aliasText};`);
    out.push("```");
    out.push("");
    return;
  }

  if (d.kind === "const") {
    if (d.members.length) {
      out.push("| Key | Value | Notes |");
      out.push("| --- | --- | --- |");
      for (const m of d.members) out.push(`| ${code(m.name)} | ${code(m.text)} | ${cell(m.doc)} |`);
    } else {
      out.push("```ts");
      out.push(`const ${d.name} = ${d.aliasText} as const;`);
      out.push("```");
    }
    out.push("");
    return;
  }

  if (d.kind === "enum") {
    out.push("| Member | Value | Notes |");
    out.push("| --- | --- | --- |");
    for (const m of d.members)
      out.push(`| ${code(m.name)} | ${code(m.text)}${m.optional ? " *(implicit)*" : ""} | ${cell(m.doc)} |`);
    out.push("");
    return;
  }

  const visible = d.members.filter((m) => !m.private);
  const hidden = d.members.length - visible.length;
  if (visible.length) {
    out.push(d.kind === "class" ? "| Member | Signature | Notes |" : "| Field | Type | Notes |");
    out.push("| --- | --- | --- |");
    for (const m of visible) {
      // An interface's "Type" column would otherwise repeat the field name back.
      const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const text =
        d.kind === "interface" ? m.text.replace(new RegExp(`^${escaped}\\??:\\s*`), "") : m.text;
      out.push(`| ${code(m.name)}${m.optional ? " *(opt)*" : ""} | ${code(truncate(text, 200))} | ${cell(m.doc)} |`);
    }
    out.push("");
  } else if (!hidden) {
    out.push("*No members.*");
    out.push("");
  }
  if (hidden) {
    out.push(`*Plus ${hidden} private member${hidden === 1 ? "" : "s"}.*`);
    out.push("");
  }
}

function main(): void {
  const files = walk(SRC).sort();
  const decls = files.flatMap(parse);

  const byArea = new Map<string, Decl[]>();
  for (const d of decls) {
    const area = areaOf(d.file);
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area)!.push(d);
  }

  const counts = (list: Decl[]) => {
    const c: Record<Kind, number> = { enum: 0, class: 0, interface: 0, type: 0, const: 0 };
    for (const d of list) c[d.kind] += 1;
    return c;
  };
  const total = counts(decls);

  const out: string[] = [];
  out.push("# Type reference");
  out.push("");
  out.push(
    "Every enum, class, interface, type alias, and `as const` constant declared under `src/`, " +
      "grouped by the area of the engine that owns it. Each entry cites the file and line it is " +
      "declared on, so this file is a map into the code rather than a replacement for it.",
  );
  out.push("");
  out.push(
    "**Generated — do not edit by hand.** Regenerate with `npm run docs:types` " +
      "(`tools/typeref/generate.ts`) after adding or renaming a declaration. Prose lives in the " +
      "doc comments on the declarations themselves; the generator lifts it from there.",
  );
  out.push("");
  out.push("## Totals");
  out.push("");
  out.push("| Area | Enums | Classes | Interfaces | Type aliases | Constants | Total |");
  out.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const area of AREAS) {
    const list = byArea.get(area.dir);
    if (!list?.length) continue;
    const c = counts(list);
    out.push(
      `| [${area.title}](#${area.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}) | ${c.enum} | ${c.class} | ` +
        `${c.interface} | ${c.type} | ${c.const} | ${list.length} |`,
    );
  }
  out.push(
    `| **All** | **${total.enum}** | **${total.class}** | **${total.interface}** | ` +
      `**${total.type}** | **${total.const}** | **${decls.length}** |`,
  );
  out.push("");
  out.push("## Conventions");
  out.push("");
  out.push("- Entries are grouped by area, then by kind (enums, constants, classes, interfaces, type aliases), then alphabetically.");
  out.push("- Class tables list the public surface. Private fields are counted but not named — they are implementation detail and change without notice.");
  out.push("- `*(opt)*` marks an optional field or property.");
  out.push("- `*(module-private)*` marks a declaration that is not exported; it is listed because it shapes a public signature.");
  out.push("- Long initialisers and generated data tables are truncated with `…`.");
  out.push("- Notes are the declaration's own doc comment, first paragraph onwards, flattened to one line.");
  out.push("");

  const ORDER: Kind[] = ["enum", "const", "class", "interface", "type"];
  const SECTION: Record<Kind, string> = {
    enum: "Enums",
    const: "Constants",
    class: "Classes",
    interface: "Interfaces",
    type: "Type aliases",
  };

  /** Document order: area, then kind, then alphabetical. Anchors follow it. */
  const ordered = AREAS.flatMap((area) =>
    ORDER.flatMap((kind) =>
      (byArea.get(area.dir) ?? []).filter((d) => d.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
    ),
  );
  const anchors = assignAnchors(ordered);

  for (const area of AREAS) {
    const list = byArea.get(area.dir);
    if (!list?.length) continue;
    out.push("---");
    out.push("");
    out.push(`## ${area.title}`);
    out.push("");
    out.push(area.blurb);
    out.push("");
    for (const kind of ORDER) {
      const group = list.filter((d) => d.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
      if (!group.length) continue;
      out.push(`### ${area.title} — ${SECTION[kind]}`);
      out.push("");
      for (const d of group) renderDecl(d, anchors.get(d)!, out);
    }
  }

  out.push("---");
  out.push("");
  out.push("## Index");
  out.push("");
  out.push("| Name | Kind | Declared in |");
  out.push("| --- | --- | --- |");
  for (const d of [...decls].sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file)))
    out.push(`| [${d.name}](#${anchors.get(d)}) | ${KIND_LABEL[d.kind]} | \`${d.file}:${d.line}\` |`);
  out.push("");

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out.join("\n"));
  console.log(`${OUT}: ${decls.length} declarations from ${files.length} files`);
}

main();
