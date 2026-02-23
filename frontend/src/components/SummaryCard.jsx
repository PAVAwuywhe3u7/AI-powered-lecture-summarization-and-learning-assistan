import SectionBlock from "./SectionBlock";

function SummaryCard({ summary }) {
  const overviewParagraphs = Array.isArray(summary?.overview_paragraphs) ? summary.overview_paragraphs : [];

  return (
    <div className="card card-elevated space-y-6 p-6 sm:p-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">Structured Summary</h2>
        <p className="mt-1 text-sm text-slate-300">Multi-pass synthesis with exam-focused organization.</p>
      </div>

      <section className="rounded-2xl border border-blue-400/25 bg-gradient-to-br from-blue-500/15 via-slate-900/45 to-cyan-500/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/90">3-Paragraph Lecture Synthesis</p>
        <div className="mt-3 space-y-3 text-sm leading-7 text-slate-100/95">
          {overviewParagraphs.length ? (
            overviewParagraphs.map((paragraph, index) => (
              <p key={`overview-${index}`}>
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-blue-300/45 text-[11px] font-semibold text-blue-100">
                  {index + 1}
                </span>
                {paragraph}
              </p>
            ))
          ) : (
            <p className="text-slate-300">Overview paragraphs are being prepared from lecture context.</p>
          )}
        </div>
      </section>

      <div className="space-y-3">
        <SectionBlock title="Key Definitions" items={summary?.key_definitions} defaultOpen />
        <SectionBlock title="Core Concepts" items={summary?.core_concepts} />
        <SectionBlock title="Important Examples" items={summary?.important_examples} />
        <SectionBlock title="Exam Revision Points" items={summary?.exam_revision_points} />
      </div>
    </div>
  );
}

export default SummaryCard;
