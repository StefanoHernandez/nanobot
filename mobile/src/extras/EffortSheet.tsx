import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "../i18n";
import { useSession } from "../state/sessionStore";
import { Button } from "../ui/components/Button";
import { Sheet } from "../ui/components/Sheet";
import { toast } from "../ui/components/Toast";
import { useTheme } from "../ui/ThemeProvider";
import { applyEffort, type EffortState } from "./effort";

export type EffortSheetProps = {
  open: boolean;
  onClose: () => void;
  chatKey: string;
  state: EffortState;
};

export function EffortSheet({ open, onClose, chatKey, state }: EffortSheetProps) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();

  const initialLevel = state.current ?? state.levels[0];
  const [selected, setSelected] = useState<string>(initialLevel);
  const selectedRef = useRef(initialLevel);
  const [loading, setLoading] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (open) {
      busyRef.current = false;
      setLoading(false);
      const init = state.current ?? state.levels[0];
      selectedRef.current = init;
      setSelected(init);
    }
  }, [open, state.current, state.levels]);

  const selectLevel = (level: string) => {
    selectedRef.current = level;
    setSelected(level);
  };

  const handleApply = async () => {
    if (busyRef.current) return;
    if (!session) return;

    busyRef.current = true;
    setLoading(true);

    try {
      await applyEffort(session, chatKey, state, selectedRef.current);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(msg);
      // keep the previous level highlighted as current
      const prev = state.current ?? state.levels[0];
      selectedRef.current = prev;
      setSelected(prev);
      busyRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("extras.reasoning")}>
      <View style={styles.container}>
        <View
          style={[
            styles.segmentContainer,
            {
              backgroundColor: th.colors.muted,
              borderRadius: th.radius.md,
            },
          ]}
        >
          {state.levels.map((level) => {
            const isSelected = selected === level;
            const label = t(`extras.effort.${level}`, { defaultValue: level });
            return (
              <Pressable
                key={level}
                onPress={() => selectLevel(level)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.segment,
                  {
                    backgroundColor: isSelected ? th.colors.background : "transparent",
                    borderRadius: th.radius.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: isSelected ? th.colors.foreground : th.colors.mutedForeground,
                      fontFamily: isSelected ? th.font.medium : th.font.regular,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Button
          title={t("extras.apply")}
          onPress={handleApply}
          loading={loading}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    gap: 16,
  },
  segmentContainer: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    alignItems: "center",
  },
  segment: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segmentText: {
    fontSize: 14,
    textTransform: "capitalize",
  },
});
