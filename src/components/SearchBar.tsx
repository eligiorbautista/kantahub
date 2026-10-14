// Search field for the TV browse screen. Controlled input; Escape clears.
// Styled large and high-contrast — the TV is read and driven from across
// the room. Focusable via keyboard (native tab stop); Escape is handled in
// onKeyDown so the field participates in the shell's keyboard model.
export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <input
      data-testid="search-bar"
      aria-label="Search songs by title or artist"
      type="text"
      role="searchbox"
      tabIndex={0}
      value={value}
      placeholder="Search title or artist"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && value) {
          e.preventDefault();
          onChange("");
        }
      }}
      style={{
        width: "100%",
        fontSize: "1.6vw",
        fontWeight: 600,
        padding: "1.2vh 1vw",
        color: "#fafafa",
        background: "#1b2030",
        border: "2px solid #39415a",
        borderRadius: "0.6vw",
      }}
    />
  );
}
