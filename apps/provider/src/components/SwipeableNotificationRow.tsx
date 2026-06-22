import React, { memo, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { TouchableOpacity } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

type SwipeableHandle = Swipeable | null;

export type NotificationSwipeRegistry = {
  register: (id: string, ref: SwipeableHandle) => void;
  closeOthers: (openId: string) => void;
};

export function useNotificationSwipeRegistry(): NotificationSwipeRegistry {
  const refs = useRef(new Map<string, SwipeableHandle>());

  const register = useCallback((id: string, ref: SwipeableHandle) => {
    if (ref) refs.current.set(id, ref);
    else refs.current.delete(id);
  }, []);

  const closeOthers = useCallback((openId: string) => {
    refs.current.forEach((ref, id) => {
      if (id !== openId) ref?.close();
    });
  }, []);

  return { register, closeOthers };
}

type SwipeableNotificationRowProps = {
  itemId: string;
  onDelete: () => void;
  deleteLabel?: string;
  deleteA11y?: string;
  swipeRegistry?: NotificationSwipeRegistry;
  children: React.ReactNode;
};

function SwipeableNotificationRowInner({
  itemId,
  onDelete,
  deleteLabel = "Delete",
  deleteA11y = "Delete notification",
  swipeRegistry,
  children,
}: SwipeableNotificationRowProps) {
  const setSwipeRef = useCallback(
    (ref: SwipeableHandle) => {
      swipeRegistry?.register(itemId, ref);
    },
    [itemId, swipeRegistry],
  );

  useEffect(() => {
    return () => {
      swipeRegistry?.register(itemId, null);
    };
  }, [itemId, swipeRegistry]);

  const renderRightActions = useCallback(
    () => (
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onDelete}
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={deleteA11y}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.deleteLabel}>{deleteLabel}</Text>
        </TouchableOpacity>
      </View>
    ),
    [onDelete, deleteA11y, deleteLabel],
  );

  return (
    <Swipeable
      ref={setSwipeRef}
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      containerStyle={styles.container}
      childrenContainerStyle={styles.childrenContainer}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() => swipeRegistry?.closeOthers(itemId)}
    >
      {children}
    </Swipeable>
  );
}

export const SwipeableNotificationRow = memo(SwipeableNotificationRowInner);

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  childrenContainer: {
    backgroundColor: "transparent",
  },
  actions: {
    width: 80,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteLabel: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.white,
  },
});
