import { useState } from "react";
import { motion } from "framer-motion";

import EmptyStateCard from "../components/EmptyStateCard";
import Loader from "../components/Loader";
import MCQCard from "../components/MCQCard";
import { useSession } from "../context/SessionContext";
import { generateMcq, getErrorMessage } from "../services/api";

function MCQPage() {
  const { summary, sessionId, setSessionId, mcqs, setMcqs } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (!summary) {
    return (
      <EmptyStateCard
        title="No summary context for MCQs"
        description="Generate a lecture summary first. MCQ generation uses that context to keep questions grounded."
        primaryAction={{ label: "Open Studio", to: "/studio" }}
      />
    );
  }

  const handleGenerate = async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await generateMcq({
        session_id: sessionId || undefined,
        summary,
      });
      setSessionId(response.session_id);
      setMcqs(response.mcqs);
    } catch (mcqError) {
      setError(getErrorMessage(mcqError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">MCQ Test Generator</h1>
          <p className="mt-1 text-sm text-slate-300">Attempt first, then review explanations for each answer.</p>
        </div>
        <button onClick={handleGenerate} type="button" className="primary-btn focus-ring" disabled={isLoading}>
          {mcqs.length ? "Regenerate 5 MCQs" : "Generate 5 MCQs"}
        </button>
      </div>

      {isLoading && <Loader label="Generating MCQs..." />}
      {error && <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      {!mcqs.length && !isLoading && (
        <div className="empty-inline-state">
          <p className="empty-inline-title">No MCQs yet</p>
          <p className="empty-inline-body">Generate your first 5 questions to start practice mode.</p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="card p-5">
              <div className="skeleton-line h-6 w-3/4 rounded-md" />
              <div className="mt-4 grid gap-2">
                <div className="skeleton-line h-10 w-full rounded-lg" />
                <div className="skeleton-line h-10 w-full rounded-lg" />
                <div className="skeleton-line h-10 w-full rounded-lg" />
                <div className="skeleton-line h-10 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="space-y-4">
          {mcqs.map((mcq, index) => (
            <MCQCard key={`${mcq.question}-${index}`} index={index} mcq={mcq} />
          ))}
        </div>
      )}
    </motion.section>
  );
}

export default MCQPage;
