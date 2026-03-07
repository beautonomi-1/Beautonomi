import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useColorScheme as useDeviceColorScheme,
  Platform,
  Appearance,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  /** The resolved theme: always "light" or "dark" */
  colorScheme: "light" | "dark";
  /** The user's preference: "light", "dark", or "system" */
  themeMode: ThemeMode;
  /** Whether dark mode is currently active */
  isDark: boolean;
  /** Update the theme preference (persisted to AsyncStorage) */
  setThemeMode: (mode: ThemeMode) => void;
  /** Convenience toggle between light and dark (ignores system) */
  toggleTheme: () => void;
  /** The resolved theme — alias for colorScheme */
  theme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue>({
  colorScheme: "light",
  themeMode: "system",
  isDark: false,
  setThemeMode: () => {},
  toggleTheme: () => {},
  theme: "light",
});

const THEME_KEY = "beautonomi_theme_mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const deviceScheme = useDeviceColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState(false);

  // Load saved preference
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      if (val === "light" || val === "dark" || val === "system") {
        setThemeModeState(val);
      }
      setLoaded(true);
    });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_KEY, mode);
    // Also tell the system about our preference for status bar etc.
    if (Platform.OS !== "web") {
      Appearance.setColorScheme(mode === "system" ? null : mode);
    }
  }, []);

  const colorScheme = useMemo(() => {
    if (themeMode === "system") return deviceScheme ?? "light";
    return themeMode;
  }, [themeMode, deviceScheme]);

  const isDark = colorScheme === "dark";

  const toggleTheme = useCallback(() => {
    setThemeMode(isDark ? "light" : "dark");
  }, [isDark, setThemeMode]);

  const value = useMemo(
    () => ({
      colorScheme,
      themeMode,
      isDark,
      setThemeMode,
      toggleTheme,
      theme: colorScheme,
    }),
    [colorScheme, themeMode, isDark, setThemeMode, toggleTheme],
  );

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
