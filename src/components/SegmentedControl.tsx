interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`min-h-12 flex-1 rounded-xl border px-4 text-sm font-semibold transition-all duration-300 active:scale-[0.98] ${
              isSelected
                ? "border-clay bg-clay-tint text-clay-dark shadow-soft"
                : "border-sand bg-white text-slate hover:border-clay/40 hover:bg-oatmeal/60"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
