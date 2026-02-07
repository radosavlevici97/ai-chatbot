"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  code: string;
  lang: string;
};

export function ShikiHighlighter({ code, lang }: Props) {
  const [html, setHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("shiki").then(({ codeToHtml }) => {
      codeToHtml(code, {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
      }).then((result) => {
        if (!cancelled) setHtml(result);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-3 rounded-lg border bg-muted">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
        <span>{lang}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div
        className="overflow-x-auto p-3 text-sm [&_pre]:!bg-transparent [&_code]:!bg-transparent"
        dangerouslySetInnerHTML={{
          __html: html || `<pre><code>${code}</code></pre>`,
        }}
      />
    </div>
  );
}
