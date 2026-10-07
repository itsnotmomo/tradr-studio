// Small Markdown renderer for notes: headings, paragraphs, lists, tables, bold, italic, links.
// Builds React elements (no raw HTML).
import { Fragment, type ReactNode } from "react";

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  const clean = (s: string) => s.replace(/\\([_~*|\\-])/g, "$1");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(clean(text.slice(last, m.index)));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<a key={k} href={m[2]} target="_blank" rel="noreferrer" className="underline underline-offset-2">{clean(m[1])}</a>);
    else if (m[3]) out.push(<b key={k}>{inline(m[3], i)}</b>);
    else if (m[4]) out.push(<i key={k}>{clean(m[4])}</i>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(clean(text.slice(last)));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^#{1,4} /.test(l)) {
      blocks.push(<h3 key={i} className="font-bold text-[14px] mt-3">{inline(l.replace(/^#+ /, ""), i)}</h3>);
      i++;
      continue;
    }
    if (l.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "---")) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={i} className="overflow-x-auto">
          <table className="text-[12.5px] w-full">
            <thead><tr>{head.map((c, j) => <th key={j} className="text-left font-semibold py-1 pr-3 border-b" style={{ borderColor: "var(--line)" }}>{inline(c, j)}</th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, x) => <td key={x} className="py-1 pr-3 border-b align-top" style={{ borderColor: "var(--line)" }}>{inline(c, x)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^- /.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      blocks.push(<ul key={i} className="list-disc pl-5 flex flex-col gap-1">{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4} |- |\|)/.test(lines[i].trim())) para.push(lines[i++]);
    blocks.push(<p key={i}>{inline(para.join(" "), i)}</p>);
  }
  return <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
