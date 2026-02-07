import { FileText } from "lucide-react";

type Props = {
  source: string;
  page: number;
  relevance: number;
};

export function CitationBadge({ source, page, relevance }: Props) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
      <FileText className="h-3 w-3" />
      {source}
      {page > 0 && <span className="text-muted-foreground">p.{page}</span>}
      <span className="text-muted-foreground">{Math.round(relevance * 100)}%</span>
    </span>
  );
}
