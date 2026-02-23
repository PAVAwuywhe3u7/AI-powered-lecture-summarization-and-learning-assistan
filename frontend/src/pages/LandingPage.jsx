import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import BotsSection from "../components/BotsSection";

const spotlightCards = [
  {
    title: "Auto Preview Intelligence",
    body: "Paste a YouTube URL and get instant title, thumbnail, and context before generation.",
  },
  {
    title: "3-Paragraph Synthesis",
    body: "Multi-pass pipeline produces coherent lecture understanding, not shallow bullet spam.",
  },
  {
    title: "Exam-Ready Outputs",
    body: "Context-grounded MCQs, revision points, and exportable PDF notes in one workflow.",
  },
];

const process = [
  { step: "01", title: "Capture", desc: "YouTube, PDF, text upload, or direct paste input." },
  { step: "02", title: "Reason", desc: "Chunking + map-reduce + validation for high-quality notes." },
  { step: "03", title: "Revise", desc: "Use Chat Bot, Homework Bot, MCQs, and polished PDF export." },
];

function LandingPage() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="space-y-10"
    >
      <div className="landing-hero relative overflow-hidden rounded-3xl border border-slate-700/70 p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -left-10 -top-10 h-56 w-56 rounded-full bg-blue-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-14 top-14 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100/90">Premium Learning OS</p>
            <h1 className="display-font text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Edu Simplify
              <span className="block text-slate-200">Turn lectures into clarity.</span>
            </h1>
            <p className="max-w-xl text-sm leading-7 text-slate-200/90 sm:text-base">
              A cinematic AI learning studio that transforms long lectures into accurate three-paragraph synthesis,
              focused revision bullets, grounded chat answers, and exam-ready MCQs.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link to="/studio" className="primary-btn">
                Enter Studio
              </Link>
              <Link to="/homework-bot" className="secondary-btn">
                Open Homework Bot
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {spotlightCards.map((item) => (
                <div key={item.title} className="hero-chip">
                  <p className="hero-chip-title">{item.title}</p>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="panel-glass p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/90">Live Workspace View</p>
              <div className="mt-3 space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/55 p-3">
                <div className="flex items-center justify-between rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 py-2">
                  <p className="text-xs text-slate-300">Source</p>
                  <p className="text-xs font-semibold text-emerald-300">Auto-detected</p>
                </div>
                <div className="rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-3">
                  <p className="text-xs text-slate-400">Current lecture</p>
                  <p className="mt-1 text-sm font-semibold text-white">Preview appears automatically from URL</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-blue-400/30 bg-blue-500/10 p-2 text-xs text-blue-100">Summary</div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-2 text-xs text-slate-200">Chat Bot</div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-2 text-xs text-slate-200">Homework Bot</div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-2 text-xs text-slate-200">MCQ + PDF</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="panel-glass p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">No-Block Operation</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                If API quota drops, Edu Simplify continues with offline fallback so your workflow never stops.
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      <BotsSection />

      <div className="grid gap-5 lg:grid-cols-3">
        {process.map((item) => (
          <motion.article
            key={item.step}
            whileHover={{ y: -3 }}
            className="card card-elevated rounded-2xl border border-slate-700/70 p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/90">{item.step}</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{item.desc}</p>
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}

export default LandingPage;
