import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../../i18n";
import { Button, Dialog, IconButton, TextField, goBackOr } from "../../../ui/components";
import { useTheme } from "../../../ui/ThemeProvider";
import { toast } from "../../../ui/components/Toast";
import { useSettings } from "../../../settings/store";
import { useSkills } from "../../../ecosystem/skills";
import { installGate, toastEcosystemError } from "../../../ecosystem/common";
import { SkillDetailSheet } from "./SkillDetailSheet";
import { SkillItem, SkillRow } from "./SkillRow";
import type { MarketplaceSkillSummary } from "@/lib/types";

export type SkillsTab = "installed" | "discover" | "trending";

export function SkillsScreen() {
  const t = useT();
  const th = useTheme();
  const nav = useNavigation?.();
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

  useEffect(() => {
    if (!settings) void refreshSettings();
  }, [refreshSettings, settings]);

  useEffect(() => {
    const unsub = nav?.addListener?.("focus", () => {
      void refreshSettings();
    });
    return () => unsub?.();
  }, [nav, refreshSettings]);

  const gateAllowed = installGate(settings).allowed;

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
      toastEcosystemError(e, t);
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
      <View style={[styles.header, { borderBottomColor: th.colors.border }]}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel={t("common.back", "Back")}
          onPress={() => goBackOr(router, "/ecosystem")}
        />
        <Text style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.medium }]}>
          {t("skills.title")}
        </Text>
      </View>

      {!gateAllowed ? (
        <View style={[styles.gateBanner, { backgroundColor: th.colors.accent }]}>
          <Text style={[styles.gateBannerText, { color: th.colors.accentForeground }]}>
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
        <View style={[styles.tabBar, { borderBottomColor: th.colors.border }]}>
          <View style={styles.tabButtonsRow}>
            <Button
              title={t("skills.tabs.installed", "Installed")}
              variant={tab === "installed" ? "primary" : "ghost"}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "installed" }}
              onPress={() => setTab("installed")}
            />
            <Button
              title={t("skills.tabs.discover", "Discover")}
              variant={tab === "discover" ? "primary" : "ghost"}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "discover" }}
              onPress={() => setTab("discover")}
            />
            <Button
              title={t("skills.tabs.trending", "Trending")}
              variant={tab === "trending" ? "primary" : "ghost"}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "trending" }}
              onPress={() => setTab("trending")}
            />
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void handleRefresh()} />}
      >
        {displayedItems.length === 0 && !isLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: th.colors.mutedForeground }]}>
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
            <Text style={[styles.noteText, { color: th.colors.mutedForeground }]}>
              {t("skills.note")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <SkillDetailSheet
        open={!!selectedDetailSkill}
        skillName={selectedDetailSkill}
        onClose={() => setSelectedDetailSkill(null)}
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
    borderBottomWidth: 1,
    minHeight: 56,
  },
  title: {
    fontSize: 18,
    marginLeft: 4,
  },
  gateBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gateBannerText: {
    fontSize: 14,
    lineHeight: 20,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tabBar: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabButtonsRow: {
    flexDirection: "row",
    gap: 8,
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
