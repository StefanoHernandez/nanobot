import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { Dialog, IconButton, TextField, goBackOr } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { useSettings } from "../../../settings/store";
import { useSkills } from "../../../ecosystem/skills";
import { installGate, isPolicyError, toastEcosystemError } from "../../../ecosystem/common";
import { usePrivileged } from "../../../ecosystem/privilege";
import { useSession } from "../../../state/sessionStore";
import { SkillDetailSheet } from "./SkillDetailSheet";
import { SkillItem, SkillRow } from "./SkillRow";
import { SkillProposalRow } from "./SkillProposalRow";
import { SkillProposalSheet } from "./SkillProposalSheet";
import {
  type SkillProposal,
  fetchProposals,
  fetchScoutSettings,
  saveScoutSettings,
} from "./proposalsApi";
import type { MarketplaceSkillSummary } from "@/lib/types";

export type SkillsTab = "installed" | "discover" | "trending";

export function SkillsScreen() {
  const t = useT();
  const th = useTheme();
  const nav = useNavigation?.();
  const { session } = useSession();
  const { data: settings, refresh: refreshSettings } = useSettings();
  const {
    skills,
    loading: skillsLoading,
    refresh,
    discover,
    search,
    trending,
    install,
    update,
  } = useSkills();

  const [proposals, setProposals] = useState<SkillProposal[]>([]);
  const [scoutEnabled, setScoutEnabled] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);

  const loadProposals = useCallback(async () => {
    if (!session) return;
    const list = await fetchProposals(session);
    setProposals(list);
  }, [session]);

  const loadScout = useCallback(async () => {
    if (!session) return;
    const s = await fetchScoutSettings(session);
    setScoutEnabled(s.enabled);
  }, [session]);

  const toggleScout = async (val: boolean) => {
    setScoutEnabled(val);
    if (!session) return;
    try {
      await saveScoutSettings(session, val);
    } catch {
      setScoutEnabled(!val);
    }
  };

  useEffect(() => {
    void loadProposals();
    void loadScout();
  }, [loadProposals, loadScout]);

  useEffect(() => {
    if (!settings) void refreshSettings();
  }, [refreshSettings, settings]);

  useEffect(() => {
    const unsub = nav?.addListener?.("focus", () => {
      void refreshSettings();
      void loadProposals();
      void loadScout();
    });
    return () => unsub?.();
  }, [nav, refreshSettings, loadProposals, loadScout]);

  const privileged = usePrivileged();
  const gateAllowed = installGate(settings, privileged).allowed;

  const [tab, setTab] = useState<SkillsTab>("installed");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [discoverSkills, setDiscoverSkills] = useState<MarketplaceSkillSummary[]>([]);
  const [trendingSkills, setTrendingSkills] = useState<MarketplaceSkillSummary[]>([]);
  const [searchResults, setSearchResults] = useState<MarketplaceSkillSummary[]>([]);

  const [tabLoading, setTabLoading] = useState(false);
  const [operatingSkill, setOperatingSkill] = useState<string | null>(null);
  const [selectedDetailSkill, setSelectedDetailSkill] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "install" | "update";
    skill: SkillItem | null;
  }>({
    open: false,
    type: "install",
    skill: null,
  });

  // Debounce search query by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Execute search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }
    let active = true;
    setTabLoading(true);
    search(debouncedQuery)
      .then((res) => {
        if (active) setSearchResults(res.skills ?? []);
      })
      .catch((e) => {
        if (active) toastEcosystemError(e, t);
      })
      .finally(() => {
        if (active) setTabLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, search, t]);

  useEffect(() => {
    if (debouncedQuery) return;
    if (tab === "discover" && discoverSkills.length === 0) {
      setTabLoading(true);
      discover()
        .then((res) => setDiscoverSkills(res.skills ?? []))
        .catch((e) => toastEcosystemError(e, t))
        .finally(() => setTabLoading(false));
    } else if (tab === "trending" && trendingSkills.length === 0) {
      setTabLoading(true);
      trending()
        .then((res) => setTrendingSkills(res.skills ?? []))
        .catch((e) => toastEcosystemError(e, t))
        .finally(() => setTabLoading(false));
    }
  }, [tab, debouncedQuery, discover, trending, discoverSkills.length, trendingSkills.length, t]);

  const handleRefresh = async () => {
    void refreshSettings();
    void loadProposals();
    void loadScout();
    if (debouncedQuery) {
      const res = await search(debouncedQuery);
      setSearchResults(res.skills ?? []);
    } else if (tab === "discover") {
      const res = await discover();
      setDiscoverSkills(res.skills ?? []);
    } else if (tab === "trending") {
      const res = await trending();
      setTrendingSkills(res.skills ?? []);
    } else {
      await refresh();
    }
  };

  const handleInstallClick = (item: SkillItem) => {
    setConfirmDialog({ open: true, type: "install", skill: item });
  };

  const handleUpdateClick = (item: SkillItem) => {
    setConfirmDialog({ open: true, type: "update", skill: item });
  };

  const handleConfirmAction = async () => {
    const { skill } = confirmDialog;
    setConfirmDialog({ open: false, type: "install", skill: null });
    if (!skill) return;

    setOperatingSkill(skill.name);
    try {
      const marketplace = skill as MarketplaceSkillSummary;
      const provider = marketplace.provider || "skills_sh";
      const source = marketplace.source || "skills_sh";
      const skillId = marketplace.skill_id || marketplace.id || skill.name;
      const version = marketplace.version;

      const res = await install(provider, source, skillId, version);
      if (res?.timedOut) {
        toast.show(t("apps.timedOut"));
      } else {
        toast.show(t("common.success", "Success"));
      }
    } catch (e) {
      // The app's own gate (host flag off) keeps its copy; a server 403 means this device lacks full power.
      if (isPolicyError(e) && !(e as { policy?: boolean }).policy) {
        toast.show(t("skills.installNeedsFullPower"));
      } else {
        toastEcosystemError(e, t);
      }
    } finally {
      setOperatingSkill(null);
    }
  };

  const isInstalledMap = new Set(skills.map((s) => s.name));

  const displayedItems: SkillItem[] = debouncedQuery
    ? searchResults
    : tab === "installed"
      ? skills
      : tab === "discover"
        ? discoverSkills
        : trendingSkills;

  const isLoading = skillsLoading || tabLoading;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel={t("common.back", "Back")}
          onPress={() => goBackOr(router, "/ecosystem")}
        />
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.display }]}>
          {t("skills.title")}
        </Text>
        <View style={styles.scoutContainer}>
          <Text style={[styles.scoutText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
            {t("skills.scoutSwitch", "Proponi skill ogni notte")}
          </Text>
          <Switch
            value={scoutEnabled}
            onValueChange={(val) => void toggleScout(val)}
            accessibilityLabel={t("skills.scoutSwitch", "Proponi skill ogni notte")}
          />
        </View>
      </View>

      {!gateAllowed ? (
        <View style={[styles.gateBanner, { backgroundColor: th.colors.muted, borderRadius: th.radius.md }]}>
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 13, lineHeight: 18 }}>
            {t("apps.gateBanner")}
          </Text>
        </View>
      ) : null}

      <View style={styles.searchSection}>
        <TextField
          label=""
          placeholder={t("skills.searchPlaceholder")}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {!debouncedQuery ? (
        <View style={[styles.tabBar, { backgroundColor: th.colors.muted, borderRadius: 999 }]}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "installed" }}
            onPress={() => setTab("installed")}
            style={[
              styles.tabSegment,
              {
                backgroundColor: tab === "installed" ? th.colors.card : "transparent",
              },
            ]}
          >
            <Text
              style={{
                color: tab === "installed" ? th.colors.foreground : th.colors.mutedForeground,
                fontFamily: tab === "installed" ? th.font.medium : th.font.regular,
                fontSize: 15,
              }}
            >
              {t("skills.tabs.installed", "Installed")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "discover" }}
            onPress={() => setTab("discover")}
            style={[
              styles.tabSegment,
              {
                backgroundColor: tab === "discover" ? th.colors.card : "transparent",
              },
            ]}
          >
            <Text
              style={{
                color: tab === "discover" ? th.colors.foreground : th.colors.mutedForeground,
                fontFamily: tab === "discover" ? th.font.medium : th.font.regular,
                fontSize: 15,
              }}
            >
              {t("skills.tabs.discover", "Discover")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "trending" }}
            onPress={() => setTab("trending")}
            style={[
              styles.tabSegment,
              {
                backgroundColor: tab === "trending" ? th.colors.card : "transparent",
              },
            ]}
          >
            <Text
              style={{
                color: tab === "trending" ? th.colors.foreground : th.colors.mutedForeground,
                fontFamily: tab === "trending" ? th.font.medium : th.font.regular,
                fontSize: 15,
              }}
            >
              {t("skills.tabs.trending", "Trending")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void handleRefresh()} />}
      >
        {!debouncedQuery && tab === "installed" && proposals.length > 0 ? (
          <View style={styles.proposalsSection}>
            <Text style={[styles.sectionTitle, { color: th.colors.foreground, fontFamily: th.font.displayBold }]}>
              {t("skills.proposalsTitle", "Proposte dal bot")}
            </Text>
            {proposals.map((item) => (
              <SkillProposalRow
                key={item.name}
                item={item}
                onPress={(p) => setSelectedProposal(p.name)}
              />
            ))}
          </View>
        ) : null}

        {displayedItems.length === 0 && !isLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
              {debouncedQuery
                ? t("skills.empty")
                : tab === "installed"
                  ? t("skills.emptyInstalled")
                  : t("skills.empty")}
            </Text>
          </View>
        ) : (
          displayedItems.map((item) => (
            <SkillRow
              key={item.name + (item as any).id}
              item={item}
              isInstalled={isInstalledMap.has(item.name) || (item as any).installed === true}
              gateAllowed={gateAllowed}
              isOperating={operatingSkill === item.name}
              onPress={(s) => setSelectedDetailSkill(s.name)}
              onInstall={handleInstallClick}
              onUpdate={handleUpdateClick}
            />
          ))
        )}

        {!debouncedQuery && tab === "installed" ? (
          <View style={styles.noteContainer}>
            <Text style={[styles.noteText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
              {t("skills.note")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <SkillProposalSheet
        open={!!selectedProposal}
        proposalName={selectedProposal}
        onClose={() => setSelectedProposal(null)}
        onUpdated={() => {
          void refresh();
          void loadProposals();
        }}
      />

      <SkillDetailSheet
        open={!!selectedDetailSkill}
        skillName={selectedDetailSkill}
        onClose={() => setSelectedDetailSkill(null)}
        onDeleted={() => void refresh()}
      />

      <Dialog
        open={confirmDialog.open}
        title={confirmDialog.type === "install" ? t("skills.installTitle") : t("skills.updateTitle")}
        message={
          confirmDialog.type === "install"
            ? t("skills.installMessage", { name: confirmDialog.skill?.name || "" })
            : t("skills.updateMessage", { name: confirmDialog.skill?.name || "" })
        }
        confirmLabel={t("skills.confirm")}
        cancelLabel={t("skills.cancel")}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmDialog({ open: false, type: "install", skill: null })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    minHeight: 56,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    marginLeft: 4,
    flex: 1,
  },
  scoutContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginRight: 12,
  },
  scoutText: {
    fontSize: 12,
  },
  proposalsSection: {
    gap: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 4,
  },
  gateBanner: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tabBar: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 4,
    flexDirection: "row",
    gap: 4,
  },
  tabSegment: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
  },
  noteContainer: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  noteText: {
    fontSize: 13,
    textAlign: "center",
  },
});
