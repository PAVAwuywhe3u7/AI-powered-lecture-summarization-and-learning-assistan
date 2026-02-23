import { useState } from "react";

function MCQCard({ index, mcq }) {
  const [selectedIndex, setSelectedIndex] = useState(null);

  const isAnswered = selectedIndex !== null;

  const optionClass = (optionIndex) => {
    if (!isAnswered) {
      return "border-slate-600/80 bg-slate-900/35 hover:bg-slate-800/80";
    }

    if (optionIndex === mcq.correct_index) {
      return "border-emerald-400/60 bg-emerald-500/20";
    }

    if (optionIndex === selectedIndex) {
      return "border-rose-400/60 bg-rose-500/20";
    }

    return "border-slate-600/80 bg-slate-900/35";
  };

  return (
    <article className="card p-5">
      <h3 className="text-base font-semibold text-white">
        Q{index + 1}. {mcq.question}
      </h3>

      <div className="mt-4 grid gap-3">
        {mcq.options.map((option, optionIndex) => (
          <button
            key={`${mcq.question}-${optionIndex}`}
            type="button"
            onClick={() => setSelectedIndex(optionIndex)}
            disabled={isAnswered}
            aria-pressed={selectedIndex === optionIndex}
            className={`focus-ring rounded-xl border px-4 py-3 text-left text-sm transition ${optionClass(optionIndex)} ${
              isAnswered ? "cursor-default" : "cursor-pointer"
            }`}
          >
            <span className="font-semibold">{String.fromCharCode(65 + optionIndex)}.</span> {option}
          </button>
        ))}
      </div>

      {isAnswered && (
        <div className="mt-4 rounded-xl border border-slate-600/80 bg-slate-900/40 p-3 text-sm text-slate-200">
          <p className="font-semibold text-emerald-300">
            Correct: {String.fromCharCode(65 + mcq.correct_index)}. {mcq.options[mcq.correct_index]}
          </p>
          <p className="mt-2 text-slate-300">{mcq.explanation}</p>
        </div>
      )}
    </article>
  );
}

export default MCQCard;
