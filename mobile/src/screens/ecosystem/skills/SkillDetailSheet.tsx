import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Dialog, Sheet, toast } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { Markdown } from "../../../ui/markdown/Markdown";
import { useSkills } from "../../../ecosystem/skills";
import { isPolicyError } from "../../../ecosystem/common";
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
  const { detail, remove } = useSkills();

  const [skillDetail, setSkillDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
          if (active) setError(isPolicyError(e) ? t("apps.gateBanner") : t("common.operationFailed"));
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

  const isWorkspace = skillDetail?.source === "workspace";

  const handleDelete = async () => {
    if (!skillName || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await remove(skillName);
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      setConfirmOpen(false);
      const status = (e as { status?: number; error?: string }).status;
      const message = (e as Error).message;
      if (status === 403 || message?.includes("remote skill")) {
        toast.show(t("skills.deleteNeedsFullPower"));
      } else {
        toast.show(t("common.operationFailed"));
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!open || !skillName) return null;

  return (
    <>
      <Sheet open={open} title={skillDetail?.name || skillName} onClose={onClose}>
        <View style={styles.container}>
          {loading ? (
            <View style={styles.loadingWrapper}>
              <ActivityIndicator size="large" color={th.colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.errorWrapper}>
              <Text style={[styles.errorText, { color: th.colors.destructive, fontFamily: th.font.regular }]}>{error}</Text>
            </View>
          ) : skillDetail ? (
            <ScrollView style={styles.scroll}>
              {skillDetail.description ? (
                <Text style={[styles.description, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                  {skillDetail.description}
                </Text>
              ) : null}
              {skillDetail.raw_markdown ? (
                <Markdown text={skillDetail.raw_markdown} fontSize={14} />
              ) : null}
            </ScrollView>
          ) : null}

          <View style={styles.closeWrapper}>
            {isWorkspace ? (
              <Button
                title={t("skills.delete")}
                variant="destructive"
                onPress={() => setConfirmOpen(true)}
              />
            ) : null}
            <Button title={t("common.close", "Close")} variant="secondary" onPress={onClose} />
          </View>
        </View>
      </Sheet>
      <Dialog
        open={confirmOpen}
        destructive
        title={t("skills.delete")}
        message={t("skills.deleteConfirm", { name: skillDetail?.name || skillName })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
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
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  closeWrapper: {
    marginTop: 8,
    gap: 8,
  },
});
