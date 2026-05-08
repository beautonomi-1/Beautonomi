import React, { ReactNode } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import type { PositioningContext } from "@/features/calendar/utils/positioning";
import { Colors } from "@/constants/colors";

interface Props {
  children: ReactNode;
  positioningCtx: PositioningContext;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  scrollViewRef?: React.RefObject<ScrollView>;
  threeDayMode?: boolean;
  weekMode?: boolean;
}

export function CalendarGridView({
  children,
  positioningCtx,
  onSwipeLeft,
  onSwipeRight,
  scrollViewRef,
  threeDayMode,
  weekMode,
}: Props) {
  const panGesture = Gesture.Pan()
    .activeOffsetX([-52, 52])
    .failOffsetY([-24, 24])
    .onEnd((e) => {
      if (e.translationX < -50 && onSwipeLeft) {
        onSwipeLeft();
      } else if (e.translationX > 50 && onSwipeRight) {
        onSwipeRight();
      }
    });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scroll}
          contentContainerStyle={{
            paddingTop: positioningCtx.gridTopPadding,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Time Gutter + Columns injected as children */}
          <View style={{ flexDirection: "row", flex: 1 }}>{children}</View>
        </ScrollView>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scroll: {
    flex: 1,
  },
});
