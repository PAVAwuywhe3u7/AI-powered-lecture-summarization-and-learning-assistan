import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import EmptyStateCard from "../components/EmptyStateCard";
import SummaryCard from "../components/SummaryCard";
import { useSession } from "../context/SessionContext";
import { downloadPdf, generateMcq, getErrorMessage } from "../services/api";

function formatSummaryForClipboard(summary) {
  const sections = [
    ["Lecture Synthesis (3 Paragraphs)", summary.overview_paragraphs],
    ["Key Definitions", summary.key_definitions],
    ["Core Concepts", summary.core_concepts],
    ["Important Examples", summary.important_examples],
    ["Exam Revision Points", summary.exam_revision_points],
  ];

  return sections
    .map(([title, values]) => `${title}\n${(values || []).map((line) => `- ${line}`).join("\n")}`)
    .join("\n\n");
}

function SummaryPage() {
  const navigate = useNavigate();
  const { summary, sessionId, setSessionId, setMcqs, videoMeta } = useSession();

  const [copied, setCopied] = useState(false);
  const [loadingMcq, setLoadingMcq] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [error, setError] = useState("");

  if (!summary) {
    return (
      <EmptyStateCard
        title="No summary available yet"
        description="Run the Studio pipeline first, then this page will show structured notes and quick actions."
        primaryAction={{ label: "Open Studio", to: "/studio" }}
      />
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatSummaryForClipboard(summary));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (clipboardError) {
      setError(getErrorMessage(clipboardError));
    }
  };

  const handleGenerateMcq = async () => {
    setError("");
    setLoadingMcq(true);

    try {
      const response = await generateMcq({
        session_id: sessionId || undefined,
        summary,
      });
      setSessionId(response.session_id);
      setMcqs(response.mcqs);
      navigate("/mcq");
    } catch (mcqError) {
      setError(getErrorMessage(mcqError));
    } finally {
      setLoadingMcq(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!sessionId) {
      setError("Session missing. Re-generate summary and try again.");
      return;
    }

    setError("");
    setLoadingPdf(true);
    try {
      await downloadPdf(sessionId);
    } catch (pdfError) {
      setError(getErrorMessage(pdfError));
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-white">Summary Studio</h1>
        <p className="text-sm text-slate-300">Map-reduce synthesis with context-grounded notes and rapid revision actions.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[250px_1fr] xl:grid-cols-[270px_1fr]">
        <aside className="action-rail card card-elevated h-max p-4 lg:sticky lg:top-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-blue-200/90">Action Rail</p>
          <div className="space-y-2">
            <button type="button" onClick={handleCopy} className="secondary-btn w-full text-left">
              {copied ? "Copied Notes" : "Copy Notes"}
            </button>
            <button
              type="button"
              onClick={handleGenerateMcq}
              disabled={loadingMcq}
              className="primary-btn w-full disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loadingMcq ? "Generating MCQ..." : "Generate MCQ"}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={loadingPdf}
              className="secondary-btn w-full disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loadingPdf ? "Preparing PDF..." : "Download PDF"}
            </button>
            <button type="button" onClick={() => navigate("/chat-bot")} className="secondary-btn w-full text-left">
              Open Chat Bot
            </button>
            <button type="button" onClick={() => navigate("/homework-bot")} className="secondary-btn w-full text-left">
              Open Homework Bot
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">Sticky quick actions stay visible while reviewing sections.</p>
        </aside>

        <div className="space-y-4">
          {videoMeta?.video_id && (
            <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/45">
              <div className="grid gap-3 sm:grid-cols-[210px_1fr]">
                <img
                  src={videoMeta.thumbnail_url}
                  alt={videoMeta.title}
                  className="h-full min-h-24 w-full object-cover"
                  loading="lazy"
                />
                <div className="space-y-1 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-200/90">Source Video</p>
                  <h3 className="text-base font-semibold text-white">{videoMeta.title}</h3>
                  {videoMeta.channel_title && <p className="text-sm text-slate-300">Channel: {videoMeta.channel_title}</p>}
                </div>
              </div>
            </div>
          )}

          <SummaryCard summary={summary} />
          {error && <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        </div>
      </div>
    </motion.section>
  );
}

export default SummaryPage;
