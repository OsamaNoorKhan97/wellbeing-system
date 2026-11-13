import { ratingOption, ratingScales, type RatingCategory } from '../lib/ratings';

export function RatingPicker({ category, value, onChange, error }: {
  category: RatingCategory;
  value: number | null;
  onChange: (value: number) => void;
  error?: boolean;
}) {
  const scale = ratingScales[category];
  return (
    <fieldset className={`rounded-xl border bg-white p-4 shadow-xs sm:p-5 ${error ? 'border-red-300' : 'border-slate-200'}`}>
      <legend className="sr-only">{scale.title}</legend>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-base font-semibold text-ink">{scale.title}</p>
        <p className="text-sm text-slate-500">{scale.question}</p>
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {scale.options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 px-1 py-3 text-center transition-all has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 ${
                selected ? 'border-brand-600 bg-brand-50 shadow-sm' : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-slate-100'
              }`}
            >
              <input type="radio" name={category} value={option.value} checked={selected} onChange={() => onChange(option.value)} className="sr-only" />
              <span className={`text-3xl transition-transform sm:text-4xl ${selected ? 'scale-110' : 'opacity-80 grayscale-[35%]'}`} aria-hidden>
                {option.emoji}
              </span>
              <span className={`text-[11px] leading-tight font-medium sm:text-xs ${selected ? 'text-brand-800' : 'text-slate-600'}`}>{option.label}</span>
              <span className="text-[10px] text-slate-400">{option.value}</span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">Please choose a rating for {scale.title.toLowerCase()}.</p>}
    </fieldset>
  );
}

/** Compact read-only display of one rating: emoji, label and score. */
export function RatingChip({ category, value }: { category: RatingCategory; value: number }) {
  const option = ratingOption(category, value);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-lg" aria-hidden>
        {option.emoji}
      </span>
      <span className="text-sm text-slate-700">{option.label}</span>
      <span className="text-xs text-slate-400">({value}/5)</span>
    </span>
  );
}
