/**
 * Renders the Point of Sale manual (content/pointOfSaleManual.md, a copy of
 * docs/POINT_OF_SALE_MANUAL.md) as page elements. Only the plain Markdown the
 * manual uses: headings, paragraphs, bullet and numbered lists, tables, rules,
 * **bold** and `code`. Everything is React text - no raw HTML is inserted.
 */
import type { ReactNode } from 'react';

/** **bold** and `code` inside a line. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    out.push(token.startsWith('**') ? <strong key={key++}>{token.slice(2, -2)}</strong> : <code key={key++}>{token.slice(1, -1)}</code>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

/** The manual's Markdown as a list of blocks. */
export function renderManual(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2]);
      blocks.push(level === 1 ? <h1 key={key++}>{content}</h1> : level === 2 ? <h2 key={key++}>{content}</h2> : <h3 key={key++}>{content}</h3>);
      i += 1;
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={key++} />);
      i += 1;
      continue;
    }
    if (trimmed.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      const [head, , ...body] = rows;
      blocks.push(
        <div className="table-wrap" key={key++}>
          <table className="data-table">
            <thead>
              <tr>
                {cells(head).map((cell, n) => (
                  <th key={n}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>
                  {cells(row).map((cell, n) => (
                    <td key={n}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^(\s*)- (.*)$/;
    const numbered = /^(\s*)\d+\.\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: Array<{ text: string; sub: string[] }> = [];
      while (i < lines.length && lines[i].trim()) {
        const current = lines[i];
        const top = ordered ? numbered.exec(current) : bullet.exec(current);
        const sub = bullet.exec(current) ?? numbered.exec(current);
        if (top && top[1].length === 0) items.push({ text: top[2], sub: [] });
        else if (sub && sub[1].length > 0 && items.length) items[items.length - 1].sub.push(sub[2]);
        else if (items.length) items[items.length - 1].text += ` ${current.trim()}`;
        else break;
        i += 1;
      }
      const children = items.map((item, n) => (
        <li key={n}>
          {inline(item.text)}
          {item.sub.length ? (
            <ul>
              {item.sub.map((s, m) => (
                <li key={m}>{inline(s)}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ));
      blocks.push(ordered ? <ol key={key++}>{children}</ol> : <ul key={key++}>{children}</ul>);
      continue;
    }
    // A paragraph: lines up to the next blank line or block.
    const parts: string[] = [];
    const startsBlock = (text: string) => /^#{1,3}\s/.test(text.trim()) || text.trim().startsWith('|') || /^-{3,}$/.test(text.trim()) || bullet.test(text) || numbered.test(text);
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      parts.push(lines[i].trim());
      i += 1;
    }
    if (!parts.length) {
      parts.push(trimmed);
      i += 1;
    }
    blocks.push(<p key={key++}>{inline(parts.join(' '))}</p>);
  }
  return blocks;
}
