import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import { useAuth } from "./context/AuthContext";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const SummaryPage = lazy(() => import("./pages/SummaryPage"));
const SolverPage = lazy(() => import("./pages/SolverPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const MCQPage = lazy(() => import("./pages/MCQPage"));

function PageFallback() {
  return (
    <div className="card card-elevated page-fallback mt-4 p-5 sm:p-6" aria-busy="true" aria-live="polite">
      <p className="text-sm font-semibold text-foreground">Loading workspace...</p>
      <div className="mt-4 grid gap-3">
        <div className="skeleton-line h-8 w-full rounded-lg" />
        <div className="skeleton-line h-8 w-11/12 rounded-lg" />
        <div className="skeleton-line h-8 w-10/12 rounded-lg" />
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { isAuthenticated, isChecking } = useAuth();
  const location = useLocation();

  if (isChecking) {
    return <PageFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function App() {
  const location = useLocation();
  const hideChrome = location.pathname === "/login" || location.pathname === "/signup";

  return (
    <div className="flex min-h-screen flex-col font-sans">
      {!hideChrome && <a href="#main-content" className="skip-link">Skip to main content</a>}
      {!hideChrome && <Navbar />}
      <main id="main-content" className={`${hideChrome ? "w-full flex-1" : "mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 lg:px-6"}`}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><LandingPage /></RequireAuth>} />
            <Route path="/studio" element={<RequireAuth><HomePage /></RequireAuth>} />
            <Route path="/home" element={<Navigate to="/studio" replace />} />
            <Route path="/summary" element={<RequireAuth><SummaryPage /></RequireAuth>} />
            <Route path="/homework-bot" element={<RequireAuth><SolverPage /></RequireAuth>} />
            <Route path="/chat-bot" element={<RequireAuth><ChatPage /></RequireAuth>} />
            <Route path="/chat" element={<Navigate to="/homework-bot" replace />} />
            <Route path="/context-chat" element={<Navigate to="/chat-bot" replace />} />
            <Route path="/mcq" element={<RequireAuth><MCQPage /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!hideChrome && <Footer />}
    </div>
  );
}

export default App;
