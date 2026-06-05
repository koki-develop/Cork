import { Search } from "lucide-react";
import { type Ref, useImperativeHandle, useRef } from "react";

import { Input } from "@/components/atoms";

export type SearchBarHandle = {
  focus: () => void;
  blur: () => void;
};

export type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<SearchBarHandle>;
};

export function SearchBar({ value, onChange, ref }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
  }));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (value !== "") onChange("");
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative flex w-full">
      <Search className="text-cork-muted/50 pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
      <Input
        ref={inputRef}
        type="search"
        placeholder="Search tasks…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="pl-8"
      />
    </div>
  );
}
