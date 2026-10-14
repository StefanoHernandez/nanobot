import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Sheet } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { Markdown } from "../../../ui/markdown/Markdown";
import { useSkills } from "../../../ecosystem/skills";
import type { SkillDetail } from "@/lib/types";

export function SkillDetailSheet({
  open,
  skillName,
  onClose,
}: {
  open: boolean;
  skillName: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const th = useTheme();
  const { detail } = useSkills();

  const [skillDetail, setSkillDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && skillName) {
      let active = true;
      setLoading(true);
      setError(null);
      detail(skillName)
        .then((res) => {
          if (active) setSkillDetail(res);
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    } else {
      setSkillDetail(null);
    }
  }, [open, skillName, detail]);

  if (!open || !skillName) return null;

  return (
    <Sheet open={open} title={skillDetail?.name || skillName} onClose={onClose}>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={th.colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorWrapper}>
            <Text style={[styles.errorText, { color: th.colors.destructive }]}>{error}</Text>
          </View>
        ) : skillDetail ? (
          <ScrollView style={styles.scroll}>
            {skillDetail.description ? (
              <Text style={[styles.description, { color: th.colors.mutedForeground }]}>
                {skillDetail.description}
              </Text>
            ) : null}
            {skillDetail.raw_markdown ? (
              <Markdown text={skillDetail.raw_markdown} fontSize={14} />
            ) : null}
          </ScrollView>
        ) : null}

        <View style={styles.closeWrapper}>
          <Button title={t("common.close", "Close")} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  loadingWrapper: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  errorWrapper: {
    paddingVertical: 20,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
  },
  scroll: {
    maxHeight: 480,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    marginBottom: 12,
  },
  closeWrapper: {
    marginTop: 8,
  },
});
