import { motion } from "framer-motion";

import Loader from "./Loader";

const sourceTabs = [
  { value: "youtube", label: "YouTube URL" },
  { value: "file", label: "Upload File" },
  { value: "paste", label: "Paste Text" },
];

const languageOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "hi", label: "Hindi" },
];

const statusMap = {
  checking: {
    label: "Checking",
    className: "border-amber-400/35 bg-amber-500/10 text-amber-200",
  },
  online: {
    label: "Connected",
    className: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  },
  offline: {
    label: "Offline",
    className: "border-rose-400/35 bg-rose-500/10 text-rose-200",
  },
};

function InputForm({
  sourceMode,
  setSourceMode,
  youtubeUrl,
  setYoutubeUrl,
  pastedText,
  setPastedText,
  language,
  setLanguage,
  fileName,
  onFileChange,
  onSubmit,
  canSubmit,
  isLoading,
  error,
  backendStatus,
  backendMessage,
  onCheckConnection,
  loadingPreview,
  videoMeta,
}) {
  const currentStatus = statusMap[backendStatus] || statusMap.checking;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/90">Source Composer</p>
          <h2 className="display-font text-3xl font-semibold tracking-tight text-white">Generate Lecture Summary</h2>
          <p className="text-sm text-slate-300">Choose one source and run the synthesis pipeline.</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${currentStatus.className}`}>
            API {currentStatus.label}
          </span>
          <button type="button" onClick={onCheckConnection} className="chip-btn">
            Recheck
          </button>
        </div>
      </div>

      {backendMessage && <p className="text-xs text-slate-400">{backendMessage}</p>}
      <p className="trust-inline-note">
        AI-generated notes can contain mistakes. Verify critical facts and avoid uploading sensitive personal content.
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        {sourceTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSourceMode(tab.value)}
            className={`source-tab ${sourceMode === tab.value ? "source-tab-active" : "source-tab-idle"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {sourceMode === "youtube" && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.6fr_0.8fr]">
              <div>
                <label className="input-label">YouTube URL</label>
                <input
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="input-field"
                  type="url"
                />
              </div>

              <div>
                <label className="input-label">Caption Language</label>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="input-field"
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingPreview && <p className="text-xs text-blue-200/90">Synchronizing automatic preview...</p>}

            {videoMeta?.video_id && (
              <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                Preview live: {videoMeta.title}
              </p>
            )}
          </div>
        )}

        {sourceMode === "file" && (
          <div>
            <label className="input-label">Upload Lecture File</label>
            <label className="upload-zone">
              <input
                type="file"
                accept=".txt,.md,.csv,.json,.pdf,application/pdf"
                onChange={onFileChange}
                className="hidden"
              />
              <span className="text-sm font-semibold text-slate-100">Choose file</span>
              <span className="text-xs text-slate-400">Supported: .txt .md .csv .json .pdf</span>
              <span className="text-xs text-slate-300">{fileName || "No file selected"}</span>
            </label>
          </div>
        )}

        {sourceMode === "paste" && (
          <div>
            <label className="input-label">Paste Transcript Text</label>
            <textarea
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              placeholder="Paste lecture notes or transcript here..."
              className="input-field min-h-52 resize-y"
            />
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <motion.button
            whileHover={{ scale: isLoading ? 1 : 1.02 }}
            whileTap={{ scale: isLoading ? 1 : 0.98 }}
            onClick={onSubmit}
            disabled={isLoading || !canSubmit}
            className="generate-cta disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
          >
            {isLoading ? "Generating..." : "Generate Summary"}
          </motion.button>
          {isLoading && <Loader label="Extracting and synthesizing..." />}
        </div>
      </div>
    </div>
  );
}

export default InputForm;
