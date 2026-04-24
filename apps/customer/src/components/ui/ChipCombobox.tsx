import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { coerceChipMultiValue, coerceChipSingleRow } from "@beautonomi/utils";

export interface SuggestionItem {
  value: string;
  label: string;
  category?: string;
}

type ValueSingle = string | null;
type ValueMulti = string[];

export interface ChipComboboxBaseProps {
  staticSuggestions?: SuggestionItem[];
  fetchSuggestions?: (
    query: string,
    selected: string[],
    context?: Record<string, unknown>
  ) => Promise<SuggestionItem[]>;
  context?: Record<string, unknown>;
  maxSuggestions?: number;
  debounceMs?: number;
  normalizeValue?: (raw: string) => string;
  placeholder?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  allowFreeForm?: boolean;
  onCreateNew?: (
    raw: string
  ) => Promise<{ value: string; label: string } | null>;
}

export interface ChipComboboxSingleProps extends ChipComboboxBaseProps {
  singleSelect: true;
  value: ValueSingle;
  onChange: (v: ValueSingle) => void;
  maxChips?: never;
}

export interface ChipComboboxMultiProps extends ChipComboboxBaseProps {
  singleSelect?: false;
  value: ValueMulti;
  onChange: (v: ValueMulti) => void;
  maxChips?: number;
}

export type ChipComboboxProps =
  | ChipComboboxSingleProps
  | ChipComboboxMultiProps;

const defaultNormalize = (raw: string) => raw.trim().toLowerCase();

function rankScore(
  item: SuggestionItem,
  queryNorm: string,
  normalize: (s: string) => string
): number {
  if (!queryNorm) return 10;
  const labelNorm = normalize(item.label);
  const valueNorm = normalize(item.value);
  if (labelNorm === queryNorm || valueNorm === queryNorm) return 100;
  if (labelNorm.startsWith(queryNorm) || valueNorm.startsWith(queryNorm))
    return 50;
  if (labelNorm.includes(queryNorm) || valueNorm.includes(queryNorm))
    return 25;
  return 0;
}

export function ChipCombobox(props: ChipComboboxProps) {
  const {
    staticSuggestions = [],
    fetchSuggestions,
    context,
    maxSuggestions = 5,
    debounceMs = 250,
    normalizeValue = defaultNormalize,
    placeholder = "Type or select…",
    accessibilityLabel,
    accessibilityHint,
    allowFreeForm = true,
    onCreateNew,
  } = props;

  const isSingle = props.singleSelect === true;
  const value = props.value;
  const onChange = props.onChange;
  /** API / JSONB may return numbers or mixed arrays; `.trim()` on those throws during render. */
  const selectedList = useMemo<string[]>(
    () => (isSingle ? coerceChipSingleRow(value) : coerceChipMultiValue(value)),
    [isSingle, value]
  );

  const maxChips = !isSingle ? (props as ChipComboboxMultiProps).maxChips ?? 0 : 1;

  const [inputValue, setInputValue] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asyncSuggestions, setAsyncSuggestions] = useState<SuggestionItem[]>([]);
  const requestIdRef = useRef(0);
  const inputRef = useRef<TextInput>(null);

  const normalize = useCallback(
    (raw: string) => normalizeValue(String(raw ?? "").trim()),
    [normalizeValue]
  );

  const selectedSet = useMemo(
    () => new Set(selectedList.map(normalize).filter(Boolean)),
    [selectedList, normalize]
  );

  const fetchAsync = useCallback(
    async (query: string) => {
      if (!fetchSuggestions) return;
      const id = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const list = await fetchSuggestions(query, selectedList, context);
        if (id === requestIdRef.current) setAsyncSuggestions(list ?? []);
      } catch (e) {
        if (id === requestIdRef.current)
          setError(e instanceof Error ? e.message : "Failed to load suggestions");
      } finally {
        if (id === requestIdRef.current) setLoading(false);
      }
    },
    [fetchSuggestions, selectedList, context]
  );

  useEffect(() => {
    if (!fetchSuggestions) return;
    const t = setTimeout(() => {
      fetchAsync(inputValue);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [inputValue, debounceMs, fetchSuggestions, fetchAsync]);

  const candidates = useMemo(() => {
    const merged = new Map<string, SuggestionItem>();
    [...staticSuggestions, ...asyncSuggestions].forEach((item) => {
      const key = normalize(item.value);
      if (!key) return;
      if (selectedSet.has(key)) return;
      merged.set(key, item);
    });
    return Array.from(merged.values());
  }, [staticSuggestions, asyncSuggestions, selectedSet, normalize]);

  const queryNorm = normalize(inputValue);
  const filteredAndRanked = useMemo(() => {
    let list = candidates;
    if (queryNorm) {
      list = candidates
        .map((item) => ({ item, score: rankScore(item, queryNorm, normalize) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.item);
    }
    return list.slice(0, maxSuggestions);
  }, [candidates, queryNorm, maxSuggestions, normalize]);

  const canAddFreeForm =
    allowFreeForm &&
    inputValue.trim() !== "" &&
    !selectedSet.has(normalize(inputValue));

  const options = useMemo(() => {
    const rows: (
      | { type: "suggestion"; value: string; label: string; isFreeForm: false }
      | { type: "freeform"; value: string; label: string; isFreeForm: true }
    )[] = filteredAndRanked.map((item) => ({
      type: "suggestion" as const,
      value: item.value,
      label: item.label,
      isFreeForm: false as const,
    }));
    if (canAddFreeForm) {
      rows.push({
        type: "freeform" as const,
        value: inputValue.trim(),
        label: "Add \"" + inputValue.trim() + "\"",
        isFreeForm: true as const,
      });
    }
    return rows;
  }, [filteredAndRanked, canAddFreeForm, inputValue]);

  const getLabelForValue = useCallback(
    (v: string): string => {
      const fromStatic = staticSuggestions.find(
        (s) => normalize(s.value) === normalize(v)
      );
      if (fromStatic) return fromStatic.label;
      const fromAsync = asyncSuggestions.find(
        (s) => normalize(s.value) === normalize(v)
      );
      if (fromAsync) return fromAsync.label;
      return v;
    },
    [staticSuggestions, asyncSuggestions, normalize]
  );

  const addValue = useCallback(
    (rawValue: string, isFreeFormEntry?: boolean) => {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      const norm = normalize(trimmed);
      if (selectedSet.has(norm)) return;

      if (isSingle) {
        if (isFreeFormEntry && onCreateNew) {
          onCreateNew(trimmed).then((res) => {
            if (res) (onChange as (v: ValueSingle) => void)(res.value);
          });
        } else {
          (onChange as (v: ValueSingle) => void)(trimmed);
        }
        setInputValue("");
        setDropdownOpen(false);
        setHighlightedIndex(-1);
        return;
      }

      const next = [...selectedList, trimmed];
      (onChange as (v: ValueMulti) => void)(next);
      setInputValue("");
      setHighlightedIndex(-1);
    },
    [
      isSingle,
      selectedSet,
      normalize,
      selectedList,
      onChange,
      onCreateNew,
    ]
  );

  const removeValue = useCallback(
    (toRemove: string) => {
      if (isSingle) {
        (onChange as (v: ValueSingle) => void)(null);
        return;
      }
      const next = selectedList.filter(
        (v) => normalize(v) !== normalize(toRemove)
      );
      (onChange as (v: ValueMulti) => void)(next);
    },
    [isSingle, selectedList, onChange, normalize]
  );

  const removeLastChip = useCallback(() => {
    if (isSingle) {
      if (value) (onChange as (v: ValueSingle) => void)(null);
      return;
    }
    if (selectedList.length > 0)
      (onChange as (v: ValueMulti) => void)(selectedList.slice(0, -1));
  }, [isSingle, value, selectedList, onChange]);

  const onFocus = useCallback(() => {
    setDropdownOpen(true);
    setHighlightedIndex(-1);
  }, []);

  const onBlur = useCallback(() => {
    setTimeout(() => setDropdownOpen(false), 200);
  }, []);

  const onKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      const key = e.nativeEvent.key;
      if (key === "Backspace" && inputValue === "" && selectedList.length > 0) {
        removeLastChip();
        return;
      }
      if (key === "Enter" && options.length > 0) {
        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
        const opt = options[idx];
        addValue(opt.value, opt.type === "freeform");
        return;
      }
      if (key === "ArrowDown") {
        setHighlightedIndex((i) => (i < options.length - 1 ? i + 1 : i));
        return;
      }
      if (key === "ArrowUp") {
        setHighlightedIndex((i) => (i > 0 ? i - 1 : -1));
        return;
      }
    },
    [
      inputValue,
      selectedList.length,
      options,
      highlightedIndex,
      removeLastChip,
      addValue,
    ]
  );

  const showDropdown = dropdownOpen && (options.length > 0 || loading || error);

  const atMaxChips =
    maxChips > 0 && selectedList.length >= maxChips && !isSingle;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputRow,
          showDropdown && styles.inputRowBorder,
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
          keyboardShouldPersistTaps="handled"
        >
          {selectedList.map((v) => (
            <View key={v} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>
                {getLabelForValue(v)}
              </Text>
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => removeValue(v)}
                accessibilityLabel={`Remove ${getLabelForValue(v)}`}
                accessibilityRole="button"
              >
                <Ionicons name="close-circle" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
          ))}
          {!atMaxChips && (
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={inputValue}
              onChangeText={setInputValue}
              onFocus={onFocus}
              onBlur={onBlur}
              onKeyPress={onKeyPress}
              placeholder={placeholder}
              placeholderTextColor="#9ca3af"
              accessibilityLabel={accessibilityLabel}
              accessibilityHint={accessibilityHint}
              accessibilityRole="combobox"
            />
          )}
        </ScrollView>
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {loading && (
            <View style={styles.dropdownRow}>
              <ActivityIndicator size="small" color="#6366f1" />
              <Text style={styles.dropdownLoadingText}>Loading…</Text>
            </View>
          )}
          {error && (
            <View style={styles.dropdownRow}>
              <Text style={styles.dropdownError}>{error}</Text>
            </View>
          )}
          {!loading && !error && options.length === 0 && (
            <View style={styles.dropdownRow}>
              <Text style={styles.dropdownEmpty}>
                {inputValue.trim() ? "No matches" : "Type to search"}
              </Text>
              {canAddFreeForm && (
                <TouchableOpacity
                  style={styles.addRow}
                  onPress={() => addValue(inputValue.trim())}
                >
                  <Text style={styles.addRowText}>
                    {"Add \"" + inputValue.trim() + "\""}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {!loading && !error && options.length > 0 && (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.optionsScroll}
              nestedScrollEnabled
            >
              {options.map((opt, idx) => (
                <TouchableOpacity
                  key={opt.type === "freeform" ? "freeform" : opt.value}
                  style={[
                    styles.optionRow,
                    idx === highlightedIndex && styles.optionRowHighlight,
                  ]}
                  onPress={() => addValue(opt.value, opt.type === "freeform")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: idx === highlightedIndex }}
                  accessibilityLabel={opt.label}
                >
                  <Text
                    style={[
                      styles.optionText,
                      opt.type === "freeform" && styles.optionTextAdd,
                    ]}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    zIndex: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputRowBorder: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  chipsScroll: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e5e7eb",
    borderRadius: 9999,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    maxWidth: 160,
  },
  chipText: {
    fontSize: 14,
    color: "#374151",
    marginRight: 4,
  },
  input: {
    flex: 1,
    minWidth: 80,
    fontSize: 16,
    color: "#111827",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "100%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#e5e7eb",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    maxHeight: 220,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownRow: {
    padding: 12,
  },
  dropdownLoadingText: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 8,
  },
  dropdownError: {
    fontSize: 14,
    color: "#dc2626",
  },
  dropdownEmpty: {
    fontSize: 14,
    color: "#6b7280",
  },
  addRow: {
    marginTop: 8,
  },
  addRowText: {
    fontSize: 14,
    color: "#6366f1",
    fontWeight: "500",
  },
  optionsScroll: {
    maxHeight: 200,
  },
  optionRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  optionRowHighlight: {
    backgroundColor: "#f3f4f6",
  },
  optionText: {
    fontSize: 16,
    color: "#111827",
  },
  optionTextAdd: {
    color: "#6366f1",
    fontWeight: "500",
  },
});
