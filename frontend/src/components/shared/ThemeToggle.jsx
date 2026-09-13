import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "../../context/ThemeContext";

const OPTIONS = [
  {
    value: "light",
    label: "Light",
    description: "Bright appearance",
    icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7M6.34 6.34l-.7-.7m12.02 0l-.7.7M6.34 17.66l-.7.7M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Dark appearance",
    icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z",
  },
  {
    value: "system",
    label: "System",
    description: "Use device preference",
    icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
];

function IconSettings() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function OptionIcon({ path }) {
  return (
    <svg
      className="w-4 h-4 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={path}
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

export default function ThemeToggle({ variant = "light" }) {
  const { mode, resolvedTheme, setMode } = useTheme();

  const [open, setOpen] = useState(false);

  const ref = useRef(null);

  /* -------------------------------------------------------
     Close menu when clicking outside
  ------------------------------------------------------- */
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        ref.current &&
        !ref.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  /* -------------------------------------------------------
     Close with Escape
  ------------------------------------------------------- */
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, []);

  const isDarkPanel = variant === "dark-panel";

  const iconColor = isDarkPanel
    ? "rgba(255,255,255,0.9)"
    : "var(--eb-text-muted)";

  const hoverBackground = isDarkPanel
    ? "rgba(255,255,255,0.12)"
    : "var(--eb-surface-muted)";

  const activeBackground = isDarkPanel
    ? "rgba(255,255,255,0.16)"
    : "var(--eb-blue-soft)";

  const currentOption =
    OPTIONS.find((option) => option.value === mode) ||
    OPTIONS[0];

  return (
    <div
      ref={ref}
      className="relative"
    >
      {/* -------------------------------------------------
          Theme button
      -------------------------------------------------- */}
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="
          w-10 h-10
          rounded-xl
          flex items-center justify-center
          transition-all duration-200
          focus:outline-none
          focus:ring-2
          focus:ring-offset-2
        "
        style={{
          color: iconColor,
          background: "transparent",
          "--tw-ring-color": "var(--eb-blue)",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background =
            hoverBackground;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background =
            "transparent";
        }}
        aria-label={`Theme: ${currentOption.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Theme: ${currentOption.label}`}
      >
        <IconSettings />
      </button>

      {/* -------------------------------------------------
          Theme menu
      -------------------------------------------------- */}
      {open && (
        <div
          role="menu"
          className="
            absolute
            right-0
            mt-2
            w-56
            rounded-2xl
            border
            shadow-2xl
            p-1.5
            z-[100]
            animate-fade-up
          "
          style={{
            background: "var(--eb-surface)",
            borderColor: "var(--eb-border)",
          }}
        >
          {/* Header */}
          <div
            className="px-3 pt-2 pb-2.5"
            style={{
              borderBottom:
                "1px solid var(--eb-border)",
            }}
          >
            <p
              className="text-sm font-semibold"
              style={{
                color: "var(--eb-text)",
              }}
            >
              Appearance
            </p>

            <p
              className="text-xs mt-0.5"
              style={{
                color: "var(--eb-text-muted)",
              }}
            >
              Choose how EchoBrains looks
            </p>
          </div>

          {/* Options */}
          <div className="pt-1">
            {OPTIONS.map((option) => {
              const selected =
                mode === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMode(option.value);
                    setOpen(false);
                  }}
                  className="
                    w-full
                    flex
                    items-center
                    gap-3
                    px-3
                    py-2.5
                    rounded-xl
                    text-left
                    transition-all
                    duration-150
                  "
                  style={{
                    color: selected
                      ? "var(--eb-blue)"
                      : "var(--eb-text)",
                    background: selected
                      ? activeBackground
                      : "transparent",
                  }}
                  onMouseEnter={(event) => {
                    if (!selected) {
                      event.currentTarget.style.background =
                        "var(--eb-surface-muted)";
                    }
                  }}
                  onMouseLeave={(event) => {
                    if (!selected) {
                      event.currentTarget.style.background =
                        "transparent";
                    }
                  }}
                >
                  <div
                    className="
                      w-8 h-8
                      rounded-lg
                      flex items-center justify-center
                      flex-shrink-0
                    "
                    style={{
                      background: selected
                        ? "var(--eb-blue-soft)"
                        : "var(--eb-surface-muted)",
                      color: selected
                        ? "var(--eb-blue)"
                        : "var(--eb-text-muted)",
                    }}
                  >
                    <OptionIcon path={option.icon} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {option.label}
                    </div>

                    <div
                      className="text-[11px] mt-0.5"
                      style={{
                        color:
                          "var(--eb-text-faint)",
                      }}
                    >
                      {option.description}
                    </div>
                  </div>

                  {selected && (
                    <div
                      className="flex-shrink-0"
                      style={{
                        color: "var(--eb-blue)",
                      }}
                    >
                      <CheckIcon />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Current resolved theme */}
          <div
            className="px-3 py-2 mt-1 rounded-xl text-[11px]"
            style={{
              background:
                "var(--eb-surface-muted)",
              color:
                "var(--eb-text-muted)",
            }}
          >
            Currently using{" "}
            <strong
              style={{
                color: "var(--eb-text)",
              }}
            >
              {resolvedTheme === "dark"
                ? "Dark"
                : "Light"}
            </strong>{" "}
            appearance
          </div>
        </div>
      )}
    </div>
  );
}