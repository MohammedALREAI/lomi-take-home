"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface SearchConfig {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function AppShell({
  search,
  children,
}: {
  search?: SearchConfig;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("lomilabs-theme");
    const prefersDark = savedTheme ? savedTheme === "dark" : false;
    setDark(prefersDark);
    document.documentElement.dataset.theme = prefersDark ? "dark" : "light";

    const savedCollapsed = window.localStorage.getItem("lomilabs-sidebar-collapsed") === "1";
    setCollapsed(savedCollapsed);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      } else if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        setCollapsed((prev) => {
          const next = !prev;
          window.localStorage.setItem("lomilabs-sidebar-collapsed", next ? "1" : "0");
          return next;
        });
      } else if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.dataset.theme = mode;
    window.localStorage.setItem("lomilabs-theme", mode);
  }

  function toggleDesktopSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("lomilabs-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className={`app-shell${collapsed ? " app-shell--collapsed" : ""}`}>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className={`sidebar-wrap${mobileOpen ? " sidebar-wrap--open" : ""}`}>
        <aside className="sidebar" aria-label="Primary sidebar">
          <div className="sidebar-top">
            <div className="sidebar-brand-row">
              <Link
                href="/"
                className="brand-link"
                title="LomiLabs — Documents"
                onClick={() => setMobileOpen(false)}
              >
                <span className="brand-mark">
                  <Icon name="logo" size={20} />
                </span>
                <span className="sidebar-label">LomiLabs</span>
              </Link>
            </div>

            <nav className="sidebar-nav" aria-label="Main navigation">
              <Link
                href="/"
                className="sidebar-link sidebar-link--active"
                title="Documents"
                onClick={() => setMobileOpen(false)}
              >
                <Icon name="documents" size={18} />
                <span className="sidebar-label">Documents</span>
              </Link>
            </nav>
          </div>

          <div className="sidebar-footer">
            <a
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              className="help-card"
              title="Open API docs"
            >
              <span className="help-card-icon">
                <Icon name="help" size={17} />
              </span>
              <span className="sidebar-label">
                <strong>Need help?</strong>
                <small>
                  Open API docs <Icon name="arrowRight" size={12} />
                </small>
              </span>
            </a>
          </div>
        </aside>

        <button
          type="button"
          className="sidebar-edge-toggle"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
          onClick={toggleDesktopSidebar}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={15} />
        </button>
      </div>

      <div className="shell-main">
        <div className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-btn mobile-menu-btn"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileOpen((o) => !o)}
            >
              <Icon name={mobileOpen ? "close" : "menu"} size={18} />
            </button>

            {search && (
              <div className="search-box">
                <span className="search-box-icon">
                  <Icon name="search" size={17} />
                </span>
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label="Search"
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder ?? "Search documents…"}
                />
                {search.value ? (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => search.onChange("")}
                  >
                    Clear
                  </button>
                ) : (
                  <kbd className="search-box-kbd" aria-hidden="true">
                    ⌘K
                  </kbd>
                )}
              </div>
            )}
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
            >
              <Icon name={dark ? "sun" : "moon"} size={18} />
            </button>
          </div>
        </div>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
