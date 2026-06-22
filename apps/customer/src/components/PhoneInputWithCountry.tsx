import { useState, useMemo, type RefObject } from "react";
import {
  View,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { RADIUS_INPUT } from "@/constants/layout";
import { COUNTRY_CODES, type CountryCodeEntry } from "@/constants/phone";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useTranslation } from "@beautonomi/i18n";

type Props = {
  label?: string;
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  nationalValue: string;
  onNationalChange: (national: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  inputAccessoryViewID?: string;
  onFocus?: TextInputProps["onFocus"];
  nationalInputRef?: RefObject<TextInput | null>;
};

export function PhoneInputWithCountry({
  label,
  countryCode,
  onCountryCodeChange,
  nationalValue,
  onNationalChange,
  placeholder,
  accessibilityLabel,
  inputAccessoryViewID,
  onFocus,
  nationalInputRef,
}: Props) {
  const { t } = useTranslation();
  const resolvedPlaceholder =
    placeholder ?? t("customer.mobile.components.phoneInput.phonePlaceholder");
  const resolvedA11y = accessibilityLabel ?? resolvedPlaceholder;
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  const selectedCountry = useMemo(
    () => COUNTRY_CODES.find((c) => c.code === countryCode),
    [countryCode]
  );

  const filteredCountries = useMemo(
    () =>
      search.trim()
        ? COUNTRY_CODES.filter((c) =>
            c.label.toLowerCase().includes(search.toLowerCase())
          )
        : COUNTRY_CODES,
    [search]
  );

  const handleNationalChange = (text: string) => {
    const digits = text.replace(/\D/g, "").replace(/^0+/, "");
    onNationalChange(digits);
  };

  return (
    <>
      <View>
        {label != null ? (
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: Colors.gray[700],
              marginBottom: 4,
            }}
          >
            {label}
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: RADIUS_INPUT,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            overflow: "hidden",
          }}
        >
          <TouchableOpacity
            onPress={() => {
              setSearch("");
              setShowPicker(true);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderRightWidth: 1,
              borderRightColor: Colors.gray[200],
              backgroundColor: Colors.gray[50],
            }}
            accessibilityRole="button"
            accessibilityLabel={`Country code: ${selectedCountry?.label ?? countryCode}`}
          >
            <Text style={{ fontSize: 18, marginRight: 4 }}>
              {selectedCountry?.flag ?? "🌍"}
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "600",
                color: Colors.gray[900],
                marginRight: 4,
              }}
            >
              {countryCode}
            </Text>
            <Ionicons name="chevron-down" size={14} color={Colors.gray[500]} />
          </TouchableOpacity>
          <TextInput
            ref={nationalInputRef}
            style={{
              flex: 1,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 16,
              color: Colors.gray[900],
            }}
            placeholder={resolvedPlaceholder}
            placeholderTextColor={Colors.gray[400]}
            value={nationalValue}
            onChangeText={handleNationalChange}
            keyboardType="phone-pad"
            accessibilityLabel={resolvedA11y}
            accessibilityRole="none"
            inputAccessoryViewID={inputAccessoryViewID}
            onFocus={onFocus}
          />
        </View>
        <Text
          style={{
            fontSize: 12,
            color: Colors.gray[500],
            marginTop: 6,
            lineHeight: 18,
          }}
        >
          {t("customer.mobile.components.phoneInput.nationalNumberHint")}
        </Text>
      </View>

      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
          onPress={() => setShowPicker(false)}
        >
          <Pressable
            style={{
              backgroundColor: Colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "70%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={{
                alignItems: "center",
                paddingTop: 12,
                paddingBottom: 4,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: Colors.gray[300],
                }}
              />
            </View>
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: Colors.gray[100],
              }}
            >
              <Text
                style={{
                  textAlign: "center",
                  fontWeight: "700",
                  fontSize: 17,
                  color: Colors.gray[900],
                  marginBottom: 12,
                }}
              >
                {t("customer.mobile.components.phoneInput.selectCountryTitle")}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: Colors.gray[100],
                  borderRadius: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Ionicons name="search" size={16} color={Colors.gray[400]} />
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    fontSize: 15,
                    color: Colors.gray[900],
                  }}
                  placeholder={t("customer.mobile.components.phoneInput.searchCountry")}
                  placeholderTextColor={Colors.gray[400]}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            <FlatList
              {...verticalFlatListPerf}
              data={filteredCountries}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }: { item: CountryCodeEntry }) => (
                <TouchableOpacity
                  onPress={() => {
                    onCountryCodeChange(c.code);
                    setShowPicker(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderColor: Colors.gray[50],
                  }}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>{c.flag}</Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color:
                        countryCode === c.code ? Colors.primary : Colors.gray[900],
                      fontWeight: countryCode === c.code ? "700" : "400",
                    }}
                  >
                    {c.label}
                  </Text>
                  {countryCode === c.code && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={Colors.primary}
                    />
                  )}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
