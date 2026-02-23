import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { useAuth } from "../context/AuthContext";
import BrandMarkIcon from "../components/BrandMarkIcon";
import { getErrorMessage } from "../services/api";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleOptions = ["Student", "Employee", "Teacher"];

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isChecking, loginWithPassword, registerWithPassword } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState(roleOptions[0]);
  const [department, setDepartment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const returnTo = useMemo(() => location.state?.from || "/", [location.state]);
  const isRegister = location.pathname === "/signup";

  const clearErrors = () => {
    if (error) {
      setError("");
    }
  };

  const validateForm = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) {
      throw new Error("Enter a valid email address.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    if (isRegister) {
      if (name.trim().length < 2) {
        throw new Error("Name must be at least 2 characters.");
      }
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
    }

    return { normalizedEmail };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    clearErrors();
    setIsSubmitting(true);

    try {
      const { normalizedEmail } = validateForm();

      if (isRegister) {
        await registerWithPassword({
          name: name.trim(),
          email: normalizedEmail,
          password,
          role,
          department: department.trim(),
        });
      } else {
        await loginWithPassword({
          email: normalizedEmail,
          password,
        });
      }

      navigate(returnTo, { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return (
      <section className="auth-shell auth-shell-compact">
        <div className="auth-loading">Checking secure session...</div>
      </section>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <section className="auth-shell auth-shell-compact">
      <div className="auth-bg-orb auth-bg-orb-a" />
      <div className="auth-bg-orb auth-bg-orb-b" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="auth-card auth-card-compact"
      >
        <div className="auth-brand auth-brand-centered">
          <span className="brand-mark auth-brand-mark auth-brand-mark-center" aria-hidden="true">
            <BrandMarkIcon className="brand-mark-icon" />
          </span>
          <p className="auth-kicker">Secure Learning Workspace</p>
          <h1 className="auth-title display-font">
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p className="auth-subtitle">
            {isRegister
              ? "Register once and continue with Studio, Summary, Homework Bot, Chat Bot, and saved bot history."
              : "Sign in to continue your study flow with your saved account and conversation history."}
          </p>
        </div>

        <div className="auth-mode-switch mt-4" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={`auth-mode-btn ${!isRegister ? "auth-mode-btn-active" : ""}`}
            onClick={() => {
              clearErrors();
              navigate("/login", { replace: true, state: { from: returnTo } });
            }}
            role="tab"
            aria-selected={!isRegister}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-mode-btn ${isRegister ? "auth-mode-btn-active" : ""}`}
            onClick={() => {
              clearErrors();
              navigate("/signup", { replace: true, state: { from: returnTo } });
            }}
            role="tab"
            aria-selected={isRegister}
          >
            Register
          </button>
        </div>

        <form className="auth-form mt-4" onSubmit={handleSubmit}>
          {isRegister && (
            <label className="auth-input-group">
              <span className="auth-input-label">Full Name</span>
              <input
                type="text"
                className="auth-field"
                value={name}
                onChange={(event) => {
                  clearErrors();
                  setName(event.target.value);
                }}
                placeholder="Your full name"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label className="auth-input-group">
            <span className="auth-input-label">Email</span>
            <input
              type="email"
              className="auth-field"
              value={email}
              onChange={(event) => {
                clearErrors();
                setEmail(event.target.value);
              }}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <div className={`auth-grid-two ${!isRegister ? "auth-grid-two-single" : ""}`}>
            <label className="auth-input-group">
              <span className="auth-input-label">Password</span>
              <input
                type="password"
                className="auth-field"
                value={password}
                onChange={(event) => {
                  clearErrors();
                  setPassword(event.target.value);
                }}
                placeholder="Minimum 8 characters"
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
              />
            </label>

            {isRegister && (
              <label className="auth-input-group">
                <span className="auth-input-label">Role</span>
                <select
                  className="auth-field"
                  value={role}
                  onChange={(event) => {
                    clearErrors();
                    setRole(event.target.value);
                  }}
                >
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {isRegister && (
            <div className="auth-grid-two">
              <label className="auth-input-group">
                <span className="auth-input-label">Confirm Password</span>
                <input
                  type="password"
                  className="auth-field"
                  value={confirmPassword}
                  onChange={(event) => {
                    clearErrors();
                    setConfirmPassword(event.target.value);
                  }}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  required
                />
              </label>

              <label className="auth-input-group">
                <span className="auth-input-label">Department</span>
                <input
                  type="text"
                  className="auth-field"
                  value={department}
                  onChange={(event) => {
                    clearErrors();
                    setDepartment(event.target.value);
                  }}
                  placeholder="Ex: Technical"
                  autoComplete="organization"
                />
              </label>
            </div>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button
            type="submit"
            className="primary-btn auth-submit disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? (isRegister ? "Creating account..." : "Signing in...")
              : (isRegister ? "Register" : "Sign In")}
          </button>
        </form>

        <p className="auth-disclaimer auth-disclaimer-center">
          {isRegister ? "Already registered?" : "Need a new account?"}{" "}
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => {
              clearErrors();
              navigate(isRegister ? "/login" : "/signup", { replace: true, state: { from: returnTo } });
            }}
          >
            {isRegister ? "Sign in" : "Create account"}
          </button>
        </p>

        <p className="auth-note auth-note-center">
          AI can be wrong. Verify critical answers before you submit homework or exam responses.
        </p>
      </motion.div>
    </section>
  );
}

export default LoginPage;
