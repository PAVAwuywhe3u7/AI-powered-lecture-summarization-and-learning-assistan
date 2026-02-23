import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useSession } from "../context/SessionContext";
import BrandMarkIcon from "./BrandMarkIcon";

const primaryNavItems = [
  { to: "/", label: "Landing" },
  { to: "/studio", label: "Studio" },
  { to: "/summary", label: "Summary" },
  { to: "/mcq", label: "MCQ" },
];

const botNavItems = [
  { to: "/homework-bot", label: "Homework Bot", hint: "Image + step-by-step solutions" },
  { to: "/chat-bot", label: "Chat Bot", hint: "Summary-grounded assistant" },
];

const THEME_STORAGE_KEY = "ui-theme";

function getInitialTheme() {
  const existingTheme = document.documentElement.dataset.theme;
  if (existingTheme === "light" || existingTheme === "dark") {
    return existingTheme;
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isBotPath(pathname) {
  return pathname.startsWith("/homework-bot") || pathname.startsWith("/chat-bot");
}

function Navbar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { clearSession } = useSession();
  const [theme, setTheme] = useState(getInitialTheme);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBotsMenuOpen, setIsBotsMenuOpen] = useState(false);
  const botsMenuRef = useRef(null);
  const botsTriggerRef = useRef(null);
  const botsItemRefs = useRef([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsBotsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!botsMenuRef.current || botsMenuRef.current.contains(event.target)) {
        return;
      }
      setIsBotsMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsBotsMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  const openBotsMenu = (focusIndex = null) => {
    setIsBotsMenuOpen(true);
    if (typeof focusIndex === "number") {
      requestAnimationFrame(() => {
        botsItemRefs.current[focusIndex]?.focus();
      });
    }
  };

  const closeBotsMenu = (restoreTriggerFocus = false) => {
    setIsBotsMenuOpen(false);
    if (restoreTriggerFocus) {
      requestAnimationFrame(() => {
        botsTriggerRef.current?.focus();
      });
    }
  };

  const handleBotsMenuKeyDown = (event) => {
    const items = botsItemRefs.current.filter(Boolean);
    if (!items.length) {
      return;
    }

    const currentIndex = items.findIndex((item) => item === document.activeElement);

    if (event.key === "Escape") {
      event.preventDefault();
      closeBotsMenu(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  const isDarkTheme = theme === "dark";
  const activeOnBotRoute = useMemo(() => isBotPath(location.pathname), [location.pathname]);
  const userLabel = useMemo(() => user?.name?.split(" ")[0] || "Account", [user?.name]);

  const handleLogout = () => {
    clearSession();
    logout();
    setIsMobileMenuOpen(false);
    setIsBotsMenuOpen(false);
  };

  return (
    <header className="site-nav sticky top-0 z-40">
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <BrandMarkIcon className="brand-mark-icon" />
          </span>
          <span>
            <span className="brand-title font-display">Edu Simplify</span>
            <span className="brand-subtitle">Smart lecture studio</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <nav className="nav-shell hidden md:flex" aria-label="Primary">
            {primaryNavItems.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {({ isActive }) => (
                  <motion.span
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    className={`nav-item ${isActive ? "nav-item-active" : "nav-item-idle"}`}
                  >
                    {item.label}
                  </motion.span>
                )}
              </NavLink>
            ))}

            <div
              ref={botsMenuRef}
              className="nav-bots-wrap"
            >
              <button
                ref={botsTriggerRef}
                type="button"
                className={`nav-item nav-bots-trigger ${activeOnBotRoute ? "nav-item-active" : "nav-item-idle"}`}
                aria-expanded={isBotsMenuOpen}
                aria-haspopup="menu"
                aria-controls="bots-menu"
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    openBotsMenu(0);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    openBotsMenu(botNavItems.length - 1);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeBotsMenu();
                  }
                }}
                onClick={() => setIsBotsMenuOpen((prev) => !prev)}
              >
                Bots
                <span className={`nav-bots-caret ${isBotsMenuOpen ? "nav-bots-caret-open" : ""}`} aria-hidden="true">
                  v
                </span>
              </button>
              {isBotsMenuOpen && (
                <div id="bots-menu" className="nav-bots-menu" role="menu" aria-label="Bots" onKeyDown={handleBotsMenuKeyDown}>
                  {botNavItems.map((item, index) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      role="menuitem"
                      className="nav-bots-link"
                      onClick={() => closeBotsMenu()}
                      ref={(node) => {
                        botsItemRefs.current[index] = node;
                      }}
                    >
                      {({ isActive }) => (
                        <span className={`nav-bots-link-inner ${isActive ? "nav-bots-link-active" : ""}`}>
                          <span className="nav-bots-link-title">{item.label}</span>
                          <span className="nav-bots-link-hint">{item.hint}</span>
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <button
            type="button"
            className="nav-mobile-toggle md:hidden"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-nav-menu"
          >
            {isMobileMenuOpen ? "Close" : "Menu"}
          </button>

          <button
            type="button"
            className="theme-toggle"
            onClick={handleThemeToggle}
            aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} theme`}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {isDarkTheme ? (
                <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
                  <path
                    d="M12 4.75v2.5m0 9.5v2.5m5.12-12.62-1.77 1.77M8.65 15.35l-1.77 1.77m10.37 0-1.77-1.77M8.65 8.65 6.88 6.88M19.25 12h-2.5m-9.5 0h-2.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="12" r="3.35" fill="currentColor" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
                  <path
                    d="M20 15.5A8.5 8.5 0 1 1 8.5 4a7 7 0 0 0 11.5 11.5Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span className="theme-toggle-label">{isDarkTheme ? "Dark" : "Light"}</span>
          </button>

          {user && (
            <>
              <div className="user-chip hidden sm:inline-flex" title={user.name}>
                {user.picture ? (
                  <img src={user.picture} alt={user.name} className="user-chip-avatar" />
                ) : (
                  <span className="user-chip-avatar user-chip-avatar-fallback">{userLabel.slice(0, 1).toUpperCase()}</span>
                )}
                <span className="user-chip-name">{userLabel}</span>
              </div>
              <button type="button" className="logout-btn hidden sm:inline-flex" onClick={handleLogout}>
                Sign out
              </button>
            </>
          )}
        </div>
      </div>

      {isMobileMenuOpen && (
        <div id="mobile-nav-menu" className="mobile-nav-panel md:hidden">
          <nav className="mobile-nav-stack" aria-label="Mobile Navigation">
            {primaryNavItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `mobile-nav-link ${isActive ? "mobile-nav-link-active" : ""}`}>
                {item.label}
              </NavLink>
            ))}
            <p className="mobile-nav-section">Bots</p>
            {botNavItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `mobile-nav-link ${isActive ? "mobile-nav-link-active" : ""}`}>
                <span>{item.label}</span>
                <span className="mobile-nav-hint">{item.hint}</span>
              </NavLink>
            ))}
            {user && (
              <div className="mobile-user-card">
                <p className="mobile-nav-section">Account</p>
                <div className="mobile-user-row">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="user-chip-avatar" />
                  ) : (
                    <span className="user-chip-avatar user-chip-avatar-fallback">{userLabel.slice(0, 1).toUpperCase()}</span>
                  )}
                  <div>
                    <p className="mobile-user-name">{user.name}</p>
                    <p className="mobile-user-email">{user.email}</p>
                  </div>
                </div>
                <button type="button" className="logout-btn w-full justify-center" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

export default Navbar;
