const levelTicks = Array.from({ length: 12 }, (_, index) => (index + 1) * 5);

interface LevelSelectorProps {
  level: number;
  onChange: (level: number) => void;
}

export function LevelSelector({ level, onChange }: LevelSelectorProps) {
  const setLevel = (value: number) => onChange(Math.max(1, Math.min(60, Math.round(value))));
  return (
    <section className="level-selector" aria-labelledby="character-level-label">
      <div className="level-selector-heading">
        <div><span id="character-level-label">Character level</span><small>Every level selectable · major stops every 5</small></div>
        <label className="level-number"><span className="sr-only">Exact character level</span><input type="number" min={1} max={60} value={level} onChange={(event) => setLevel(Number(event.target.value))} /></label>
      </div>
      <div className="level-range-wrap">
        <input
          className="level-range"
          type="range"
          min={1}
          max={60}
          step={1}
          value={level}
          aria-labelledby="character-level-label"
          aria-valuetext={`Level ${level}`}
          onChange={(event) => setLevel(Number(event.target.value))}
        />
        <div className="level-ticks">
          {levelTicks.map((tick) => (
            <button
              type="button"
              key={tick}
              className={level === tick ? "active" : ""}
              style={{ left: `${((tick - 1) / 59) * 100}%` }}
              onClick={() => setLevel(tick)}
              aria-label={`Set character level to ${tick}`}
            ><i /><span>{tick}</span></button>
          ))}
        </div>
      </div>
    </section>
  );
}
