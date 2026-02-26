// frontend/src/components/shop/ExpandableDescription.tsx
import { useState, useRef, useEffect } from "react";

interface Props {
  html: string;
  maxHeight?: number;
}

export default function ExpandableDescription({ html, maxHeight = 80 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) setNeedsToggle(ref.current.scrollHeight > maxHeight + 20);
  }, [html, maxHeight]);

  if (!html) return null;

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={ref}
        className="ed-body"
        style={{
          maxHeight: expanded ? "none" : `${maxHeight}px`,
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {needsToggle && !expanded && <div className="ed-fade" />}
      {needsToggle && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ed-btn"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              Pokaż mniej{" "}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </>
          ) : (
            <>
              Pokaż więcej{" "}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </>
          )}
        </button>
      )}
      <style>{`
        .ed-body { font-size:14px; line-height:1.7; color:hsl(var(--muted-foreground)); }
        .ed-body h2,.ed-body h3 { font-size:16px; font-weight:600; color:hsl(var(--foreground)); margin:14px 0 6px; }
        .ed-body p { margin:0 0 8px; }
        .ed-body a { color:hsl(var(--primary)); text-decoration:underline; }
        .ed-fade { position:absolute; bottom:28px; left:0; right:0; height:40px; background:linear-gradient(transparent,hsl(var(--background))); pointer-events:none; }
        .ed-btn { display:inline-flex; align-items:center; gap:4px; margin-top:6px; padding:4px 0; font-size:13px; font-weight:500; color:hsl(var(--primary)); background:none; border:none; cursor:pointer; }
        .ed-btn:hover { opacity:0.8; }
      `}</style>
    </div>
  );
}
