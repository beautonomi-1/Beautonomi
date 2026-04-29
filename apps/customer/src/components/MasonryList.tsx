/**
 * Masonry (waterfall) layout for React Native.
 * Uses @shopify/flash-list FlashList with masonry for view recycling
 * and efficient off-screen rendering.
 */
import { useCallback } from "react";
import { View, type ViewStyle, type RefreshControlProps } from "react-native";
import { FlashList } from "@shopify/flash-list";

interface MasonryListProps<T> {
  data: T[];
  numColumns?: number;
  gap?: number;
  /** Pass when renderItem / headers depend on state outside `data` (FlashList recycles cells). */
  extraData?: unknown;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  getItemHeight?: (item: T, columnWidth: number) => number;
  ListHeaderComponent?: React.ReactNode;
  ListFooterComponent?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: ViewStyle;
  columnWidth: number;
  showsVerticalScrollIndicator?: boolean;
}

export function MasonryList<T>({
  data,
  numColumns = 2,
  gap = 8,
  extraData,
  renderItem,
  keyExtractor,
  getItemHeight,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  onEndReached,
  onEndReachedThreshold = 0.3,
  refreshControl,
  contentContainerStyle,
  columnWidth,
  showsVerticalScrollIndicator = false,
}: MasonryListProps<T>) {
  const flashRenderItem = useCallback(
    ({ item, index }: { item: T; index: number }) => (
      <View style={{ paddingHorizontal: gap / 2, paddingBottom: gap }}>
        {renderItem(item, index) as React.ReactElement}
      </View>
    ),
    [renderItem, gap],
  );

  const flashKeyExtractor = useCallback(
    (item: T, index: number) => keyExtractor(item, index),
    [keyExtractor],
  );

  const overrideItemLayout = useCallback(
    (
      layout: { span?: number; size?: number },
      item: T,
      _index: number,
      _maxColumns: number,
      _extraData?: unknown,
    ) => {
      if (getItemHeight) {
        layout.size = getItemHeight(item, columnWidth) + gap;
      }
    },
    [getItemHeight, columnWidth, gap],
  );

  return (
    <FlashList
      masonry
      data={data}
      extraData={extraData}
      numColumns={numColumns}
      renderItem={flashRenderItem}
      keyExtractor={flashKeyExtractor}
      overrideItemLayout={getItemHeight ? overrideItemLayout : undefined}
      ListHeaderComponent={ListHeaderComponent as React.ReactElement}
      ListFooterComponent={ListFooterComponent as React.ReactElement}
      ListEmptyComponent={ListEmptyComponent as React.ReactElement}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    />
  );
}

