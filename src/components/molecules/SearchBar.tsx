import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { Input } from "@/components/atoms";

export type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && inputRef.current === document.activeElement) {
        if (value !== "") onChange("");
        inputRef.current?.blur();
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [value, onChange]);

  return (
    <div className="relative flex w-full">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-cork-muted/50" />
      <Input
        ref={inputRef}
        type="search"
        placeholder="Search tasks…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-8"
      />
    </div>
  );
}
