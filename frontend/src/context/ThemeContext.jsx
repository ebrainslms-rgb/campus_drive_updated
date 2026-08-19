import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
};

const STORAGE_KEY = "eb-theme";

const VALID_MODES = ["light", "dark", "system"];

/* ---------------------------------------------------------
   Detect operating-system theme
--------------------------------------------------------- */
function getSystemTheme() {
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

/* ---------------------------------------------------------
   Resolve actual theme
--------------------------------------------------------- */
function resolveTheme(mode) {
  return mode === "system" ? getSystemTheme() : mode;
}

/* ---------------------------------------------------------
   Apply theme globally
--------------------------------------------------------- */
function applyTheme(theme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  /*
   * Custom EchoBrains theme system
   */
  root.setAttribute("data-theme", theme);

  /*
   * Tailwind dark: utilities
   *
   * This is important because Login/Register and other
   * existing components may use dark:* classes.
   */
  root.classList.toggle("dark", theme === "dark");

  /*
   * Helps browser-native controls such as:
   * date picker, select menus, scrollbars, etc.
   */
  root.style.colorScheme = theme;
}

/* ---------------------------------------------------------
   Read saved preference safely
--------------------------------------------------------- */
function getInitialMode() {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (VALID_MODES.includes(saved)) {
      return saved;
    }
  } catch (error) {
    console.warn("Unable to read saved theme:", error);
  }

  /*
   * Default requirement:
   * Light theme when no preference has been selected.
   */
  return "light";
}

/* ---------------------------------------------------------
   Theme Provider
--------------------------------------------------------- */
export const ThemeProvider = ({ children }) => {
  const [mode, setModeState] = useState(getInitialMode);

  const [resolvedTheme, setResolvedTheme] = useState(() =>
    resolveTheme(getInitialMode())
  );

  /* -------------------------------------------------------
     Change theme
  ------------------------------------------------------- */
  const setMode = useCallback((nextMode) => {
    if (!VALID_MODES.includes(nextMode)) {
      console.warn(`Invalid theme mode: ${nextMode}`);
      return;
    }

    setModeState(nextMode);

    try {
      localStorage.setItem(STORAGE_KEY, nextMode);
    } catch (error) {
      console.warn("Unable to save theme preference:", error);
    }

    const resolved = resolveTheme(nextMode);

    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  /* -------------------------------------------------------
     Apply theme whenever selected mode changes
  ------------------------------------------------------- */
  useEffect(() => {
    const updateTheme = () => {
      const resolved = resolveTheme(mode);

      setResolvedTheme(resolved);
      applyTheme(resolved);
    };

    updateTheme();

    /*
     * System theme monitoring
     */
    if (
      mode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia
    ) {
      const mediaQuery = window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

      const handleSystemThemeChange = () => {
        const resolved = getSystemTheme();

        setResolvedTheme(resolved);
        applyTheme(resolved);
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener(
          "change",
          handleSystemThemeChange
        );

        return () => {
          mediaQuery.removeEventListener(
            "change",
            handleSystemThemeChange
          );
        };
      }

      /*
       * Older browser fallback
       */
      mediaQuery.addListener(handleSystemThemeChange);

      return () => {
        mediaQuery.removeListener(handleSystemThemeChange);
      };
    }
  }, [mode]);

  /* -------------------------------------------------------
     Keep theme available before page paint where possible
  ------------------------------------------------------- */
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        resolvedTheme,
        setMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};