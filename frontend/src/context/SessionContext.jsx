import { createContext, useContext, useMemo, useState } from "react";

const SessionContext = createContext(null);

const initialSummary = null;

export function SessionProvider({ children }) {
  const [sessionId, setSessionId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState(initialSummary);
  const [videoMeta, setVideoMeta] = useState(null);
  const [mcqs, setMcqs] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [solverHistory, setSolverHistory] = useState([]);

  const resetDerivedState = () => {
    setMcqs([]);
    setChatHistory([]);
  };

  const clearSession = () => {
    setSessionId("");
    setTranscript("");
    setSummary(initialSummary);
    setVideoMeta(null);
    setMcqs([]);
    setChatHistory([]);
    setSolverHistory([]);
  };

  const value = useMemo(
    () => ({
      sessionId,
      setSessionId,
      transcript,
      setTranscript,
      summary,
      setSummary,
      videoMeta,
      setVideoMeta,
      mcqs,
      setMcqs,
      chatHistory,
      setChatHistory,
      solverHistory,
      setSolverHistory,
      resetDerivedState,
      clearSession,
    }),
    [sessionId, transcript, summary, videoMeta, mcqs, chatHistory, solverHistory],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
