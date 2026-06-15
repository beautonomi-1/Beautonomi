import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { useResponsive } from "@/hooks/useResponsive";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";

export type FinanceHubTab = {
  id: string;
  label: string;
  render: () => ReactNode;
};

type FinanceHubShellProps = {
  title: string;
  subtitle?: string;
  tabs: FinanceHubTab[];
  defaultTab: string;
  headerExtra?: ReactNode;
};

export function FinanceHubShell({
  title,
  subtitle,
  tabs,
  defaultTab,
  headerExtra,
}: FinanceHubShellProps) {
  const router = useRouter();
  const handleBack = useProviderStackBack();
  const { screenPadding } = useResponsive();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tabParam = typeof params.tab === "string" ? params.tab : undefined;

  const visibleTabIds = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);
  const resolvedDefault = visibleTabIds.has(defaultTab) ? defaultTab : tabs[0]?.id ?? defaultTab;
  const [activeTab, setActiveTab] = useState(resolvedDefault);

  useEffect(() => {
    if (tabParam && visibleTabIds.has(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam, visibleTabIds]);

  const chipOptions = useMemo(
    () => tabs.map((t) => ({ label: t.label, value: t.id })),
    [tabs],
  );

  const onSelectTab = useCallback(
    (id: string) => {
      setActiveTab(id);
      router.setParams({ tab: id });
    },
    [router],
  );

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <ScreenContainer scrollable={false} noPadding>
      <View style={{ paddingHorizontal: screenPadding }}>
        <ScreenHeader title={title} subtitle={subtitle} showBack onBack={handleBack} />
        {headerExtra}
        <View style={{ paddingBottom: 8 }}>
          <FilterChipGroup options={chipOptions} selected={activeTab} onSelect={onSelectTab} />
        </View>
      </View>
      <View style={{ flex: 1 }}>{active?.render()}</View>
    </ScreenContainer>
  );
}
