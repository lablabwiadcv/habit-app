import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

const primaryItems = [
  ["today", "home", "Today"],
  ["habits", "check", "Habits"],
  ["calendar", "calendar", "Calendar"],
  ["class-schedule", "book", "Classes"],
];

const moreItems = [
  ["study", "clock", "Study"],
  ["workout", "activity", "Workout"],
  ["learning", "book", "Learning"],
  ["journal", "note", "Journal"],
  ["insights", "chart", "Insights"],
  ["flashcards", "cards", "Flashcards"],
];

export function NavIcon({ name }) {
  const iconNames = {
    home: "House",
    check: "Check",
    calendar: "CalendarDays",
    clock: "Clock",
    activity: "Activity",
    book: "BookOpen",
    note: "NotebookPen",
    chart: "ChartNoAxesCombined",
    cards: "PanelsTopLeft",
    plus: "Plus",
    more: "Ellipsis",
  };
  return <Icon name={iconNames[name] || name} />;
}

export default function MobileNav({
  section,
  onNavigate,
  dueCardCount = 0,
  profile,
  level = 1,
  levelProgress = 0,
  onXpDetails,
  onExport,
  onImport,
  onReset,
  onEditProfile,
  onAccount,
  accountLabel = "Sync across devices",
  accountStatus = "",
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const activeMenuItemRef = useRef(null);
  const wasMoreOpen = useRef(false);
  const activeMoreItem = moreItems.some(([id]) =>
    section === id ||
    (section === "flashcard-library" && id === "flashcards"),
  );
  const activeMoreLabel = section === "flashcard-library"
    ? "Flashcards"
    : moreItems.find(([id]) => section === id)?.[2];
  const activePrimaryIndex = primaryItems.findIndex(([id]) =>
    section === id ||
    (section === "add-habit" && id === "habits") ||
    (section === "add-class" && id === "class-schedule"),
  );
  const activeTabIndex = activeMoreItem || moreOpen ? 4 : Math.max(0, activePrimaryIndex);
  const navigate = (id) => {
    setMoreOpen(false);
    onNavigate(id);
    window.setTimeout(() => document.getElementById("main-content")?.focus({ preventScroll: true }), 0);
  };
  const runMenuAction = (action) => {
    setMoreOpen(false);
    action?.();
  };

  useEffect(() => {
    const updateScrollCue = () => {
      setShowBackToTop(window.scrollY > 500);
    };
    updateScrollCue();
    window.addEventListener("scroll", updateScrollCue, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollCue);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const updateKeyboardState = () => {
      setKeyboardOpen(viewport.height < window.screen.height * 0.72);
    };
    updateKeyboardState();
    viewport.addEventListener("resize", updateKeyboardState);
    return () => viewport.removeEventListener("resize", updateKeyboardState);
  }, []);

  useEffect(() => {
    if (moreOpen) {
      activeMenuItemRef.current?.focus();
    } else if (wasMoreOpen.current) {
      moreButtonRef.current?.focus({ preventScroll: true });
    }
    wasMoreOpen.current = moreOpen;
  }, [moreOpen]);

  return (
    <div
      className={`mobile-nav-wrap${keyboardOpen ? " keyboard-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && moreOpen) {
          event.preventDefault();
          setMoreOpen(false);
        }
      }}
    >
      <>
        {moreOpen && (
          <button
            type="button"
            className="mobile-more-backdrop"
            aria-label="Close more navigation"
            onClick={() => setMoreOpen(false)}
          />
        )}
        <nav className="mobile-more-menu" id="mobile-more-menu" aria-label="More navigation" hidden={!moreOpen}>
          {moreItems.map(([id, icon, label], index) => (
            <button
              type="button"
              className={section === id || (section === "flashcard-library" && id === "flashcards") ? "active" : ""}
              aria-current={section === id || (section === "flashcard-library" && id === "flashcards") ? "page" : undefined}
              key={id}
              onClick={() => navigate(id)}
              ref={section === id || (section === "flashcard-library" && id === "flashcards") || (!activeMoreItem && index === 0) ? activeMenuItemRef : undefined}
            >
              <span><NavIcon name={icon} /></span>
              {label}
              {id === "flashcards" && dueCardCount > 0 && (
                <b className="nav-count" aria-label={`${dueCardCount} flashcards due`}>{dueCardCount}</b>
              )}
            </button>
          ))}
          <div className="mobile-more-account">
            <button type="button" className="mobile-more-level" onClick={onXpDetails} aria-label={`View level ${level} XP details`}>
              <span className="mobile-more-level-spark"><Icon name="Sparkles" size={18} /></span>
              <strong>Level {level}</strong>
              <small>{levelProgress}/100 XP to next level</small>
              <span className="mobile-more-progress" aria-hidden="true">
                <i style={{ width: `${levelProgress}%` }} />
              </span>
              <small className="mobile-more-level-hint">View XP details</small>
            </button>
            <div className="mobile-more-actions" aria-label="Data and profile actions">
              <button type="button" onClick={() => runMenuAction(onExport)}><Icon name="ArrowDown" size={16} /> Export</button>
              <button type="button" onClick={() => runMenuAction(onImport)}><Icon name="ArrowUp" size={16} /> Import</button>
              <button type="button" className="reset-data" onClick={() => runMenuAction(onReset)}>Reset data</button>
            </div>
            <button type="button" className="mobile-more-sync" onClick={() => runMenuAction(onAccount)}>
              <Icon name="Cloud" size={16} />
              <span>{accountLabel}</span>
              {accountStatus && <small>{accountStatus}</small>}
            </button>
            <button type="button" className="mobile-more-profile" onClick={() => runMenuAction(onEditProfile)}>
              <span className="avatar"><Icon name={profile?.icon || "user"} size={20} /></span>
              <span>
                <strong>{profile?.name}</strong>
                <small>Personal space</small>
              </span>
            </button>
          </div>
        </nav>
      </>
      <nav className="mobile-nav" aria-label="Main">
        <span
          className="mobile-nav-current"
          style={{ "--active-index": activeTabIndex }}
          aria-hidden="true"
        />
        {primaryItems.map(([id, icon, label]) => (
          <button
            type="button"
            className={
              section === id ||
              (section === "add-habit" && id === "habits") ||
              (section === "add-class" && id === "class-schedule")
                ? "active"
                : ""
            }
            aria-current={
              section === id ||
              (section === "add-habit" && id === "habits") ||
              (section === "add-class" && id === "class-schedule")
                ? "page"
                : undefined
            }
            key={id}
            onClick={() => navigate(id)}
          >
            <span><NavIcon name={icon} /></span>
            {label}
          </button>
        ))}
        <button
          type="button"
          className={activeMoreItem || moreOpen ? "active" : ""}
          aria-expanded={moreOpen}
          aria-current={activeMoreItem ? "page" : undefined}
          aria-controls="mobile-more-menu"
          aria-label={activeMoreLabel ? `More pages, current page ${activeMoreLabel}` : "More pages"}
          ref={moreButtonRef}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span><NavIcon name="more" /></span>
          More
        </button>
      </nav>
      {showBackToTop && (
        <button
          type="button"
          className="back-to-top"
          onClick={() => window.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          })}
          aria-label="Back to top"
          title="Back to top"
        >
          <Icon name="ArrowUp" size={20} className="back-to-top-icon" />
        </button>
      )}
    </div>
  );
}
