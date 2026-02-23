import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import InputForm from "../components/InputForm";
import PanelCard from "../components/PanelCard";
import { useSession } from "../context/SessionContext";
import {
  checkApiHealth,
  extractCaptions,
  fetchVideoMeta,
  getActiveApiBaseUrl,
  getErrorMessage,
  summarizeTranscript,
} from "../services/api";

const sourceModeValidators = {
  youtube: (state) => Boolean(state.youtubeUrl.trim()),
  file: (state) => Boolean(state.fileContent.trim()),
  paste: (state) => Boolean(state.pastedText.trim()),
};

let pdfJsLoaderPromise = null;

async function loadPdfJs() {
  if (!pdfJsLoaderPromise) {
    pdfJsLoaderPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, workerModule]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default || workerModule;
      return pdfjs;
    });
  }

  return pdfJsLoaderPromise;
}

async function extractTextFromPdfFile(file) {
  const pdfjs = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const tokens = textContent.items
      .map((item) => (typeof item.str === "string" ? item.str.trim() : ""))
      .filter(Boolean);
    pageTexts.push(tokens.join(" "));
  }

  return pageTexts.join("\n").trim();
}

function HomePage() {
  const navigate = useNavigate();
  const {
    sessionId,
    setSessionId,
    setTranscript,
    setSummary,
    videoMeta,
    setVideoMeta,
    resetDerivedState,
  } = useSession();

  const [sourceMode, setSourceMode] = useState("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [language, setLanguage] = useState("en");

  const [isLoading, setIsLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState("");

  const [backendStatus, setBackendStatus] = useState("checking");
  const [backendMessage, setBackendMessage] = useState("Checking API connection...");
  const [lastPreviewUrl, setLastPreviewUrl] = useState("");

  const canSubmit = useMemo(() => {
    const validator = sourceModeValidators[sourceMode];
    if (!validator) {
      return false;
    }
    return validator({ youtubeUrl, fileContent, pastedText });
  }, [sourceMode, youtubeUrl, fileContent, pastedText]);

  const checkConnection = async () => {
    setBackendStatus("checking");
    try {
      await checkApiHealth();
      setBackendStatus("online");
      setBackendMessage(`Connected to API at ${getActiveApiBaseUrl()}`);
    } catch (healthError) {
      setBackendStatus("offline");
      setBackendMessage(getErrorMessage(healthError));
    }
  };

  const handleYoutubeUrlChange = (value) => {
    setYoutubeUrl(value);
    setError("");
    if (!value.trim()) {
      setVideoMeta(null);
      setLastPreviewUrl("");
    }
  };

  const handleSourceModeChange = (nextMode) => {
    setSourceMode(nextMode);
    if (nextMode !== "youtube") {
      setVideoMeta(null);
      setLastPreviewUrl("");
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!mounted) {
        return;
      }
      await checkConnection();
    };

    run();
    const intervalId = setInterval(run, 30000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (sourceMode !== "youtube") {
      return;
    }

    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) {
      setLoadingPreview(false);
      setLastPreviewUrl("");
      return;
    }

    if (!/(youtube\.com|youtu\.be)/i.test(trimmedUrl)) {
      return;
    }

    if (trimmedUrl === lastPreviewUrl && videoMeta?.video_id) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const preview = await fetchVideoMeta({ youtube_url: trimmedUrl, language: language || undefined });
        setVideoMeta(preview);
        setLastPreviewUrl(trimmedUrl);
      } catch {
        if (trimmedUrl === youtubeUrl.trim()) {
          setVideoMeta(null);
          setLastPreviewUrl("");
        }
      } finally {
        setLoadingPreview(false);
      }
    }, 550);

    return () => clearTimeout(timeoutId);
  }, [sourceMode, youtubeUrl, language, lastPreviewUrl, videoMeta, setVideoMeta]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      setFileContent("");
      return;
    }

    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const text = isPdf ? await extractTextFromPdfFile(file) : await file.text();
      if (!text.trim()) {
        throw new Error("Could not extract text from this file. Try another file.");
      }
      setSourceMode("file");
      setFileName(file.name);
      setFileContent(text.trim());
      setError("");
    } catch (readError) {
      setError(getErrorMessage(readError));
    }
  };

  const resolveTranscript = async () => {
    if (sourceMode === "youtube") {
      if (!youtubeUrl.trim()) {
        throw new Error("Enter a YouTube URL to continue.");
      }

      const data = await extractCaptions({
        youtube_url: youtubeUrl.trim(),
        language: language || undefined,
      });

      setVideoMeta({
        video_id: data.video_id,
        title: data.title,
        thumbnail_url: data.thumbnail_url,
        channel_title: data.channel_title || "",
      });

      return data.transcript;
    }

    if (sourceMode === "file") {
      if (!fileContent.trim()) {
        throw new Error("Upload a transcript file before generating summary.");
      }
      return fileContent.trim();
    }

    if (sourceMode === "paste") {
      if (!pastedText.trim()) {
        throw new Error("Paste transcript text before generating summary.");
      }
      return pastedText.trim();
    }

    throw new Error("Select a source type to continue.");
  };

  const handleSubmit = async () => {
    setError("");
    setIsLoading(true);

    try {
      const transcriptText = await resolveTranscript();
      const summarizeResponse = await summarizeTranscript({
        transcript: transcriptText,
        session_id: sessionId || undefined,
      });

      if (sourceMode !== "youtube") {
        setVideoMeta(null);
      }

      setSessionId(summarizeResponse.session_id);
      setTranscript(transcriptText);
      setSummary(summarizeResponse.summary);
      resetDerivedState();
      navigate("/summary");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsLoading(false);
    }
  };

  const pipelineStages = [
    {
      label: "Capture Input",
      caption: "Read URL, uploaded docs, or pasted transcript.",
      done: canSubmit || Boolean(videoMeta?.video_id),
    },
    {
      label: "Extract + Clean",
      caption: "Normalize transcript and remove noisy segments.",
      done: Boolean(fileContent || pastedText || videoMeta?.video_id),
    },
    {
      label: "Map-Reduce Synthesis",
      caption: "Chunk, summarize, merge, and build coherent notes.",
      done: false,
    },
    {
      label: "Validation Pass",
      caption: "Enforce clarity, structure, and factual consistency.",
      done: false,
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="studio-workspace grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="panel-glass panel-accent p-6 sm:p-8">
          <InputForm
            sourceMode={sourceMode}
            setSourceMode={handleSourceModeChange}
            youtubeUrl={youtubeUrl}
            setYoutubeUrl={handleYoutubeUrlChange}
            pastedText={pastedText}
            setPastedText={setPastedText}
            language={language}
            setLanguage={setLanguage}
            fileName={fileName}
            onFileChange={handleFileChange}
            onSubmit={handleSubmit}
            canSubmit={canSubmit}
            isLoading={isLoading}
            error={error}
            backendStatus={backendStatus}
            backendMessage={backendMessage}
            onCheckConnection={checkConnection}
            loadingPreview={loadingPreview}
            videoMeta={videoMeta}
          />
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <PanelCard eyebrow="Live Video Preview" className="panel-glass p-4">
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/50" aria-busy={loadingPreview}>
              {videoMeta?.video_id ? (
                <iframe
                  title={videoMeta.title || "YouTube Preview"}
                  src={`https://www.youtube.com/embed/${videoMeta.video_id}`}
                  className="h-52 w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : loadingPreview ? (
                <div className="grid h-52 gap-2 p-4">
                  <div className="skeleton-line h-6 w-2/3 rounded-md" />
                  <div className="skeleton-line h-6 w-full rounded-md" />
                  <div className="skeleton-line h-6 w-5/6 rounded-md" />
                </div>
              ) : (
                <div className="grid h-52 place-content-center p-4 text-center text-xs text-slate-400">
                  Paste a YouTube URL to see automatic live preview and metadata.
                </div>
              )}
            </div>

            <div className="mt-3 space-y-1 rounded-lg border border-slate-700/80 bg-slate-900/45 p-3">
              <p className="text-xs text-slate-400">Title</p>
              <p className="text-sm font-semibold text-slate-100">{videoMeta?.title || "Waiting for source..."}</p>
              <p className="text-xs text-slate-400">Channel: {videoMeta?.channel_title || "-"}</p>
              <p className="text-xs text-slate-400">Video ID: {videoMeta?.video_id || "-"}</p>
            </div>
          </PanelCard>

          <PanelCard eyebrow="Pipeline Status" className="panel-glass p-4">
            <div className="mt-3 space-y-2">
              {pipelineStages.map((stage, index) => {
                const inProgress = isLoading && index === 2;
                const done = stage.done || (isLoading && index < 2);
                return (
                  <div
                    key={stage.label}
                    className={`pipeline-stage ${
                      inProgress
                        ? "pipeline-stage-active"
                        : done
                          ? "pipeline-stage-done"
                          : "pipeline-stage-idle"
                    }`}
                  >
                    <div className="pipeline-index">{index + 1}</div>
                    <div>
                      <p className="text-sm font-semibold">{stage.label}</p>
                      <p className="text-xs text-slate-300/90">{stage.caption}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </PanelCard>
        </aside>
      </div>
    </motion.section>
  );
}

export default HomePage;
