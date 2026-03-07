/**
 * Masonry (waterfall) layout for React Native.
 * Splits items into N columns based on accumulated height,
 * producing the staggered Pinterest-style grid.
 */
import { useMemo } from "react";
import { View, ScrollView, type ViewStyle, type RefreshControlProps } from "react-native";

interface MasonryListProps<T> {
  data: T[];
  numColumns?: number;
  gap?: number;
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
  const columns = useMemo(() => {
    const cols: T[][] = Array.from({ length: numColumns }, () => []);
    const heights: number[] = new Array(numColumns).fill(0);

    data.forEach((item) => {
      const shortest = heights.indexOf(Math.min(...heights));
      cols[shortest].push(item);
      const h = getItemHeight ? getItemHeight(item, columnWidth) : columnWidth * 1.3;
      heights[shortest] += h + gap;
    });

    return cols;
  }, [data, numColumns, gap, getItemHeight, columnWidth]);

  const handleScroll = (e: any) => {
    if (!onEndReached) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (distanceFromEnd < layoutMeasurement.height * (onEndReachedThreshold ?? 0.3)) {
      onEndReached();
    }
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      onScroll={handleScroll}
      scrollEventThrottle={200}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    >
      {ListHeaderComponent}

      {data.length === 0 && ListEmptyComponent ? (
        ListEmptyComponent
      ) : (
        <View style={{ flexDirection: "row" }}>
          {columns.map((col, colIdx) => (
            <View key={colIdx} style={{ flex: 1, marginRight: colIdx < numColumns - 1 ? gap : 0 }}>
              {col.map((item, idx) => {
                const globalIdx = data.indexOf(item);
                return (
                  <View key={keyExtractor(item, globalIdx)} style={{ marginBottom: idx < col.length - 1 ? gap : 0 }}>
                    {renderItem(item, globalIdx)}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {ListFooterComponent}
    </ScrollView>
  );
}
