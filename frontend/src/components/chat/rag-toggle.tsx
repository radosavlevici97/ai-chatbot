"use client";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function RagToggle({ checked, onChange }: Props) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      Search my documents
    </label>
  );
}
