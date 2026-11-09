import type { ReactNode } from "react";

// Renders the small markdown subset the AI writes: **bold**, "-" or "•" bullets, numbered lists,
// and lines that are only bold (used as section headings). Plain text is kept as is.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>,
  );
}

export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`my-2 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-•*])\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      const content = (numbered ?? bullet)![1];
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push(content);
      return;
    }
    flush();
    if (heading) {
      blocks.push(<h4 key={idx} className="mt-3 text-sm font-semibold first:mt-0">{heading[1]}</h4>);
    } else if (line.trim() === "") {
      blocks.push(<div key={idx} className="h-2" />);
    } else {
      blocks.push(<p key={idx} className="leading-relaxed">{inline(line)}</p>);
    }
  });
  flush();
  return <div className="text-sm">{blocks}</div>;
}
