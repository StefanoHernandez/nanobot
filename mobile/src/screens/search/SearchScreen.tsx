import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useT } from "../../i18n";
import { useTheme } from "../../ui/ThemeProvider";
import { Button, IconButton, TextField, goBackOr } from "../../ui/components";
import { useSession } from "../../state/sessionStore";
import { fetchSearch, type SearchResult, type SearchSource } from "../../ecosystem/search";

export function HighlightedSnippet({
  text,
  style,
  highlightStyle,
}: {
  text: string;
  style?: object;
  highlightStyle?: object;
}) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith("«") && part.endsWith("»")) {
          return (
            <Text key={i} style={[{ fontWeight: "bold" }, highlightStyle]}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </Text>
  );
}

function sourceIcon(source: SearchSource): "chat-outline" | "book-open-page-variant-outline" | "view-column-outline" {
  switch (source) {
    case "chats":
      return "chat-outline";
    case "journal":
      return "book-open-page-variant-outline";
    case "kanban":
      return "view-column-outline";
  }
}

export function SearchScreen({ initialQuery }: { initialQuery?: string }) {
  const t = useT();
  const th = useTheme();
  const { session } = useSession();
  const params = useLocalSearchParams<{ q?: string }>();
  const startQuery = initialQuery ?? (typeof params.q === "string" ? params.q : "");

  const [q, setQ] = useState(startQuery);
  const [selectedSource, setSelectedSource] = useState<SearchSource | "all">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSources = useMemo(() => {
    if (selectedSource === "all") return undefined;
    return [selectedSource];
  }, [selectedSource]);

  const searchReqId = useRef(0);

  const runSearch = React.useCallback(
    async (queryText: string, sources?: SearchSource[]) => {
      const clean = queryText.trim();
      if (!clean) {
        setResults([]);
        setLoading(false);
        setError(null);
        return;
      }
      if (!session) {
        setLoading(false);
        return;
      }

      const reqId = ++searchReqId.current;
      setLoading(true);
      setError(null);

      try {
        const hits = await fetchSearch(session, clean, sources);
        if (reqId === searchReqId.current) {
          setResults(hits);
        }
      } catch (e) {
        if (reqId === searchReqId.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (reqId === searchReqId.current) {
          setLoading(false);
        }
      }
    },
    [session],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(q, activeSources);
    }, 300);
    return () => clearTimeout(timer);
  }, [q, activeSources, runSearch]);

  const handleOpenResult = (item: SearchResult) => {
    if (item.source === "chats") {
      const key = item.session_key || item.ref.split("#")[0];
      router.push({
        pathname: `/chat/${encodeURIComponent(key)}` as any,
        params: item.position !== undefined ? { position: String(item.position) } : undefined,
      });
    } else if (item.source === "journal") {
      const dateVal = item.date || item.ref.replace("journal:", "");
      router.push({
        pathname: "/ecosystem/memory" as any,
        params: { tab: "journal", date: dateVal },
      });
    } else if (item.source === "kanban") {
      const taskId = item.task_id || item.ref.replace("kanban:", "");
      router.push({
        pathname: "/ecosystem/kanban" as any,
        params: { task: taskId },
      });
    }
  };

  const chips: { key: SearchSource | "all"; label: string }[] = [
    { key: "all", label: t("search.sourceAll", "Tutti") },
    { key: "chats", label: t("search.sourceChats", "Chat") },
    { key: "journal", label: t("search.sourceJournal", "Diario") },
    { key: "kanban", label: t("search.sourceKanban", "Lavagna") },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.colors.background }]}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel={t("common.back", "Indietro")}
          onPress={() => goBackOr(router, "/")}
        />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: th.colors.foreground, fontFamily: th.font.display }]}
        >
          {t("search.title", "Cerca")}
        </Text>
      </View>

      <View style={styles.searchBox}>
        <TextField
          label={t("search.title", "Cerca")}
          placeholder={t("search.placeholder", "Cerca in tutti i messaggi, diario, lavagna…")}
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          autoCorrect={false}
          right={
            q ? (
              <IconButton
                icon="close"
                accessibilityLabel={t("common.clear", "Cancella")}
                onPress={() => setQ("")}
              />
            ) : undefined
          }
        />
      </View>

      <View style={styles.chipsRow}>
        {chips.map((chip) => {
          const active = selectedSource === chip.key;
          return (
            <Button
              key={chip.key}
              title={chip.label}
              variant={active ? "primary" : "secondary"}
              onPress={() => setSelectedSource(chip.key)}
            />
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={th.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: th.colors.destructive, fontFamily: th.font.medium }]}>
            {t("search.error", "Errore durante la ricerca")}
          </Text>
          <Text style={[styles.subText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
            {error}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Button title={t("search.retry", "Riprova")} onPress={() => void runSearch(q, activeSources)} />
          </View>
        </View>
      ) : !q.trim() ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="magnify" size={48} color={th.colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
            {t("search.emptyNoQuery", "Digita per cercare")}
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="file-search-outline" size={48} color={th.colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: th.colors.mutedForeground, fontFamily: th.font.medium }]}>
            {t("search.noResults", "Nessun risultato trovato")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.source}:${item.ref}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              style={[
                styles.resultCard,
                {
                  backgroundColor: th.colors.card,
                  borderColor: th.colors.border,
                  borderRadius: th.radius.md,
                },
              ]}
              onPress={() => handleOpenResult(item)}
            >
              <View style={styles.resultHeader}>
                <MaterialCommunityIcons
                  name={sourceIcon(item.source)}
                  size={18}
                  color={th.colors.primary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  numberOfLines={1}
                  style={[styles.resultTitle, { color: th.colors.foreground, fontFamily: th.font.medium }]}
                >
                  {item.title}
                </Text>
                {item.date ? (
                  <Text style={[styles.resultDate, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}>
                    {String(item.date).slice(0, 10)}
                  </Text>
                ) : null}
              </View>
              <HighlightedSnippet
                text={item.snippet || item.excerpt || ""}
                style={[styles.snippetText, { color: th.colors.mutedForeground, fontFamily: th.font.regular }]}
                highlightStyle={{ color: th.colors.foreground }}
              />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  title: { fontSize: 20 },
  searchBox: { paddingHorizontal: 16, paddingTop: 4 },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  resultCard: {
    padding: 14,
    borderWidth: 1,
    minHeight: 48,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  resultTitle: { flex: 1, fontSize: 15 },
  resultDate: { fontSize: 12, marginLeft: 8 },
  snippetText: { fontSize: 13, lineHeight: 18 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  emptyText: { fontSize: 15, textAlign: "center" },
  subText: { fontSize: 13, textAlign: "center" },
});
