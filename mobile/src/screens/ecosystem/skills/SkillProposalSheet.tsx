import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useT } from "../../../i18n";
import { Button, Sheet, toast } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { Markdown } from "../../../ui/markdown/Markdown";
import { useSession } from "../../../state/sessionStore";
import {
  type SkillProposal,
  activateProposal,
  fetchProposalDetail,
  rejectProposal,
} from "./proposalsApi";

export function SkillProposalSheet({
  open,
  proposalName,
  onClose,
  onUpdated,
}: {
  open: boolean;
  proposalName: string | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();

  const [detail, setDetail] = useState<SkillProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<"activate" | "reject" | null>(null);

  useEffect(() => {
    if (open && proposalName && session) {
      let active = true;
      setDetail(null);
      setLoading(true);
      setError(null);
      fetchProposalDetail(session, proposalName)
        .then((res) => {
          if (active) setDetail(res);
        })
        .catch(() => {
          if (active) setError(t("common.operationFailed", "Operazione non riuscita"));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    } else {
      setDetail(null);
    }
  }, [open, proposalName, session, t]);

  const handleActivate = async () => {
    if (!session || !proposalName || acting) return;
    setActing("activate");
    try {
      await activateProposal(session, proposalName);
      toast.show(t("skills.proposalActivated", "Skill attivata"));
      onUpdated?.();
      onClose();
    } catch (e: any) {
      if (e?.status === 403 || e?.message?.includes("403")) {
        toast.show(t("skills.installNeedsFullPower"));
      } else {
        toast.show(t("common.operationFailed"));
      }
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    if (!session || !proposalName || acting) return;
    setActing("reject");
    try {
      await rejectProposal(session, proposalName);
      toast.show(t("skills.proposalRejected", "Proposta scartata"));
      onUpdated?.();
      onClose();
    } catch {
      toast.show(t("common.operationFailed"));
    } finally {
      setActing(null);
    }
  };

  if (!open || !proposalName) return null;

  const rawMarkdown = detail?.raw_markdown || detail?.content || detail?.text || "";

  return (
    <Sheet open={open} title={detail?.name || proposalName} onClose={onClose} scroll={false}>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={th.colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorWrapper}>
            <Text style={[styles.errorText, { color: th.colors.destructive, fontFamily: th.font.regular }]}>
              {error}
            </Text>
          </View>
        ) : detail ? (
          <ScrollView style={styles.scroll}>
            {detail.reason ? (
              <View style={[styles.reasonBox, { backgroundColor: th.colors.muted, borderRadius: th.radius.sm }]}>
                <Text style={[styles.reasonLabel, { color: th.colors.mutedForeground, fontFamily: th.font.medium }]}>
                  {detail.updates ? t("skills.updateBadge", "Aggiornamento") : t("skills.proposalBadge", "Proposta")}:
                </Text>
                <Text style={[styles.reasonText, { color: th.colors.foreground, fontFamily: th.font.regular }]}>
                  {detail.reason}
                </Text>
              </View>
            ) : null}

            {rawMarkdown ? <Markdown text={rawMarkdown} fontSize={14} /> : null}
          </ScrollView>
        ) : null}

        <View style={styles.actions}>
          <Button
            title={t("skills.activate", "Attiva")}
            variant="primary"
            disabled={acting !== null || loading}
            loading={acting === "activate"}
            onPress={() => void handleActivate()}
          />
          <Button
            title={t("skills.reject", "Scarta")}
            variant="destructive"
            disabled={acting !== null || loading}
            loading={acting === "reject"}
            onPress={() => void handleReject()}
          />
          <Button title={t("common.close", "Chiudi")} variant="secondary" onPress={onClose} />
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
  reasonBox: {
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  reasonLabel: {
    fontSize: 12,
  },
  reasonText: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    marginTop: 8,
    gap: 8,
  },
});
