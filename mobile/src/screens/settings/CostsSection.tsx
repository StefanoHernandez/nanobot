import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../ui/ThemeProvider";
import { useT } from "../../i18n";
import {
  Button,
  IconButton,
  Sheet,
  TextField,
  toast,
} from "../../ui/components";
import { Chips, Head } from "./common";
import {
  costsStore,
  useCosts,
  formatCost,
  formatTokens,
  type ModelPrice,
  type ModelUsage,
} from "../../extras/costs";

export function CostsSection() {
  const t = useT();
  const th = useTheme();

  const [range, setRange] = useState<"7" | "30">("30");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data, loading, refresh } = useCosts(Number(range));

  // Mount/unmount indicator for onCostsScreen
  useEffect(() => {
    costsStore.getState().setOnCostsScreen(true);
    return () => {
      costsStore.getState().setOnCostsScreen(false);
    };
  }, []);

  // Settings inputs
  const [capText, setCapText] = useState<string | null>(null);
  const [alertPctText, setAlertPctText] = useState<string | null>(null);
  const capRef = React.useRef<string | null>(null);
  const alertPctRef = React.useRef<string | null>(null);

  const displayCap = capText !== null
    ? capText
    : data?.daily_cap_usd != null
      ? String(data.daily_cap_usd)
      : "";

  const displayAlertPct = alertPctText !== null
    ? alertPctText
    : data?.alert_pct != null
      ? String(data.alert_pct)
      : "80";

  // Price Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetIsEdit, setSheetIsEdit] = useState(false);
  const [sheetModelKey, setSheetModelKey] = useState("");
  const [sheetInputPrice, setSheetInputPrice] = useState("");
  const [sheetOutputPrice, setSheetOutputPrice] = useState("");
  const [sheetCacheReadPrice, setSheetCacheReadPrice] = useState("");

  const sheetModelKeyRef = React.useRef("");
  const sheetInputPriceRef = React.useRef("");
  const sheetOutputPriceRef = React.useRef("");
  const sheetCacheReadPriceRef = React.useRef("");

  const handleRangeChange = (newRange: "7" | "30") => {
    setRange(newRange);
    setSelectedDay(null);
    void costsStore.getState().refresh(Number(newRange));
  };

  const openAddPrice = (prefillKey = "") => {
    sheetModelKeyRef.current = prefillKey;
    sheetInputPriceRef.current = "";
    sheetOutputPriceRef.current = "";
    sheetCacheReadPriceRef.current = "";
    setSheetModelKey(prefillKey);
    setSheetInputPrice("");
    setSheetOutputPrice("");
    setSheetCacheReadPrice("");
    setSheetIsEdit(false);
    setSheetOpen(true);
  };

  const openEditPrice = (key: string, price: ModelPrice) => {
    sheetModelKeyRef.current = key;
    sheetInputPriceRef.current = String(price.input);
    sheetOutputPriceRef.current = String(price.output);
    sheetCacheReadPriceRef.current = price.cache_read != null ? String(price.cache_read) : "";
    setSheetModelKey(key);
    setSheetInputPrice(String(price.input));
    setSheetOutputPrice(String(price.output));
    setSheetCacheReadPrice(price.cache_read != null ? String(price.cache_read) : "");
    setSheetIsEdit(true);
    setSheetOpen(true);
  };

  const handleSavePrice = async () => {
    const key = sheetModelKeyRef.current.trim();
    const inVal = parseFloat(sheetInputPriceRef.current);
    const outVal = parseFloat(sheetOutputPriceRef.current);

    if (!key || isNaN(inVal) || inVal < 0 || isNaN(outVal) || outVal < 0) {
      toast.show(t("costs.invalidPrice"));
      return;
    }

    const currentPrices = { ...(data?.prices ?? {}) };
    const entry: ModelPrice = { input: inVal, output: outVal };
    if (sheetCacheReadPriceRef.current.trim()) {
      const cr = parseFloat(sheetCacheReadPriceRef.current);
      if (!isNaN(cr) && cr >= 0) entry.cache_read = cr;
    }
    currentPrices[key] = entry;

    const ok = await costsStore.getState().saveSettings({ prices: currentPrices });
    if (ok) {
      setSheetOpen(false);
    } else {
      toast.show(t("common.operationFailed"));
    }
  };

  const handleDeletePrice = async () => {
    const key = sheetModelKeyRef.current.trim();
    const currentPrices = { ...(data?.prices ?? {}) };
    delete currentPrices[key];

    const ok = await costsStore.getState().saveSettings({ prices: currentPrices });
    if (ok) {
      setSheetOpen(false);
    } else {
      toast.show(t("common.operationFailed"));
    }
  };

  const handleCapBlur = async () => {
    const currentVal = capRef.current !== null ? capRef.current : (data?.daily_cap_usd != null ? String(data.daily_cap_usd) : "");
    const trimmed = currentVal.trim();
    if (!trimmed) {
      await costsStore.getState().saveSettings({ daily_cap_usd: null });
      return;
    }
    const val = parseFloat(trimmed);
    if (isNaN(val) || val < 0) {
      toast.show(t("common.operationFailed"));
      return;
    }
    await costsStore.getState().saveSettings({ daily_cap_usd: val });
  };

  const handleAlertPctBlur = async () => {
    const currentVal = alertPctRef.current !== null ? alertPctRef.current : (data?.alert_pct != null ? String(data.alert_pct) : "80");
    const trimmed = currentVal.trim();
    const val = parseFloat(trimmed);
    if (isNaN(val) || val < 1 || val > 100) {
      toast.show(t("costs.invalidAlertPct"));
      return;
    }
    await costsStore.getState().saveSettings({ alert_pct: val });
  };

  // Generate day bars for the range
  const daysCount = Number(range);
  const dayBars = useMemo(() => {
    const todayStr = data?.today || new Date().toISOString().slice(0, 10);
    const [y, m, d] = todayStr.split("-").map(Number);
    const baseUtc = Date.UTC(y, m - 1, d);

    const list: { date: string; cost: number; models: ModelUsage[] }[] = [];
    const daysMap = new Map((data?.days ?? []).map((day) => [day.date, day]));

    for (let i = daysCount - 1; i >= 0; i--) {
      const dt = new Date(baseUtc - i * 86400000);
      const dateStr = dt.toISOString().slice(0, 10);
      const entry = daysMap.get(dateStr);
      list.push({
        date: dateStr,
        cost: entry?.cost_usd ?? 0,
        models: entry?.models ?? [],
      });
    }
    return list;
  }, [data?.today, data?.days, daysCount]);

  const maxDayCost = useMemo(() => {
    return Math.max(...dayBars.map((b) => b.cost), 0.01);
  }, [dayBars]);

  // Models to display
  const displayedModels = useMemo(() => {
    if (selectedDay) {
      const day = dayBars.find((d) => d.date === selectedDay);
      return (day?.models ?? []).slice().sort((a, b) => (b.cost_usd ?? -1) - (a.cost_usd ?? -1));
    }

    const agg = new Map<string, ModelUsage>();
    for (const d of data?.days ?? []) {
      for (const m of d.models) {
        const key = m.provider ? `${m.provider}/${m.model}` : m.model;
        const ex = agg.get(key);
        if (!ex) {
          agg.set(key, { ...m });
        } else {
          ex.input_tokens += m.input_tokens;
          ex.output_tokens += m.output_tokens;
          ex.total_tokens += m.total_tokens;
          if (m.cost_usd != null) {
            ex.cost_usd = (ex.cost_usd ?? 0) + m.cost_usd;
          }
        }
      }
    }
    return Array.from(agg.values()).sort((a, b) => (b.cost_usd ?? -1) - (a.cost_usd ?? -1));
  }, [selectedDay, dayBars, data?.days]);

  const todayCost = data?.today_cost_usd ?? 0;
  const dailyCap = data?.daily_cap_usd ?? null;
  const isAlert = !!data?.alert;
  const isOverCap = !!data?.over_cap;

  const progressColor = isOverCap
    ? th.colors.destructive
    : isAlert
      ? th.colors.brand
      : th.colors.primary;

  const progressPct = dailyCap && dailyCap > 0
    ? Math.min(100, Math.max(0, (todayCost / dailyCap) * 100))
    : 0;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refresh}
          tintColor={th.colors.primary}
        />
      }
    >
      <Head>{t("costs.title")}</Head>

      {/* Header card: Today's cost, daily cap, and progress bar */}
      <View
        style={{
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          marginHorizontal: 16,
          marginTop: 8,
          padding: 16,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.medium, fontSize: 13 }}>
            {t("costs.today")}
          </Text>
          <Text style={{ color: th.colors.foreground, fontFamily: th.font.displayBold, fontSize: 18 }}>
            {dailyCap != null
              ? `${formatCost(todayCost)} / ${formatCost(dailyCap)}`
              : formatCost(todayCost)}
          </Text>
        </View>

        {dailyCap != null ? (
          <View
            style={{
              height: 8,
              backgroundColor: th.colors.muted,
              borderRadius: th.radius.sm,
              overflow: "hidden",
            }}
          >
            <View
              testID="costs-cap-progress"
              style={[
                {
                  height: "100%",
                  width: `${progressPct}%`,
                  backgroundColor: progressColor,
                },
              ]}
            />
          </View>
        ) : null}

        {/* Range Chips & Period Total */}
        <View style={{ marginTop: 8, gap: 8 }}>
          <Chips
            options={[
              { value: "7", label: t("costs.range7d") },
              { value: "30", label: t("costs.range30d") },
            ]}
            value={range}
            onChange={(v) => handleRangeChange(v as "7" | "30")}
          />

          <Text style={{ color: th.colors.mutedForeground, fontFamily: th.font.regular, fontSize: 14 }}>
            {t("costs.total", { amount: formatCost(data?.total_cost_usd ?? 0) })}
          </Text>
        </View>

        {/* Daily bars chart */}
        <View style={{ marginTop: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              height: 70,
              gap: range === "7" ? 6 : 2,
              paddingTop: 8,
            }}
          >
            {dayBars.map((bar) => {
              const heightPct = Math.max(4, Math.round((bar.cost / maxDayCost) * 60));
              const isSelected = selectedDay === bar.date;
              return (
                <TouchableOpacity
                  key={bar.date}
                  testID="costs-day-bar"
                  onPress={() => setSelectedDay(selectedDay === bar.date ? null : bar.date)}
                  style={{
                    flex: 1,
                    height: "100%",
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                  accessibilityLabel={`${bar.date}: ${formatCost(bar.cost)}`}
                >
                  <View
                    style={{
                      width: "100%",
                      height: heightPct,
                      backgroundColor: isSelected
                        ? th.colors.brand
                        : bar.cost > 0
                          ? th.colors.primary
                          : th.colors.muted,
                      borderRadius: 2,
                    }}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedDay ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <Text style={{ color: th.colors.foreground, fontFamily: th.font.medium, fontSize: 13 }}>
                {t("costs.selectedDay", { date: selectedDay })}
              </Text>
              <Button
                title={t("costs.allDays")}
                variant="ghost"
                onPress={() => setSelectedDay(null)}
              />
            </View>
          ) : null}
        </View>
      </View>

      {/* Unpriced Banner */}
      {data && data.unpriced_models.length > 0 ? (
        <View
          style={{
            backgroundColor: th.colors.card,
            borderColor: th.colors.border,
            borderWidth: 1,
            borderRadius: th.radius.md,
            marginHorizontal: 16,
            marginTop: 12,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={th.colors.brand} />
          <Text
            style={{
              flex: 1,
              color: th.colors.foreground,
              fontFamily: th.font.regular,
              fontSize: 14,
            }}
          >
            {data.unpriced_models.length === 1
              ? t("costs.unpricedBanner_one")
              : t("costs.unpricedBanner", { count: data.unpriced_models.length })}
          </Text>
        </View>
      ) : null}

      {/* Per-model list */}
      <Head>{t("costs.modelsTitle")}</Head>
      <View
        style={{
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          marginHorizontal: 16,
          marginTop: 4,
          overflow: "hidden",
        }}
      >
        {displayedModels.length === 0 ? (
          <Text
            style={{
              padding: 16,
              color: th.colors.mutedForeground,
              fontFamily: th.font.regular,
              fontSize: 14,
            }}
          >
            {t("costs.noUsage")}
          </Text>
        ) : (
          displayedModels.map((m, idx) => {
            const key = m.provider ? `${m.provider}/${m.model}` : m.model;
            const isUnpriced = m.cost_usd === null;

            return (
              <View
                key={key}
                style={[
                  {
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  },
                  idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border },
                ]}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text
                    style={{
                      color: th.colors.foreground,
                      fontFamily: th.font.medium,
                      fontSize: 15,
                    }}
                  >
                    {m.model}
                  </Text>
                  <Text
                    style={{
                      color: th.colors.mutedForeground,
                      fontFamily: th.font.regular,
                      fontSize: 13,
                      marginTop: 2,
                    }}
                  >
                    {t("costs.inOutTokens", {
                      input: formatTokens(m.input_tokens),
                      output: formatTokens(m.output_tokens),
                    })}
                  </Text>
                </View>

                {isUnpriced ? (
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text
                      style={{
                        color: th.colors.mutedForeground,
                        fontFamily: th.font.medium,
                        fontSize: 15,
                      }}
                    >
                      —
                    </Text>
                    <Button
                      title={t("costs.setPrice")}
                      variant="ghost"
                      onPress={() => openAddPrice(key)}
                    />
                  </View>
                ) : (
                  <Text
                    style={{
                      color: th.colors.foreground,
                      fontFamily: th.font.displayBold,
                      fontSize: 15,
                    }}
                  >
                    {formatCost(m.cost_usd ?? 0)}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Model prices manager */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingRight: 16,
        }}
      >
        <Head>{t("costs.pricesTitle")}</Head>
        <Button
          title={t("costs.addPrice")}
          variant="ghost"
          onPress={() => openAddPrice()}
        />
      </View>

      <View
        style={{
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          marginHorizontal: 16,
          marginTop: 4,
          overflow: "hidden",
        }}
      >
        {data && Object.keys(data.prices).length > 0 ? (
          Object.entries(data.prices).map(([key, price], idx) => (
            <View
              key={key}
              style={[
                {
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                },
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: th.colors.foreground,
                    fontFamily: th.font.medium,
                    fontSize: 15,
                  }}
                >
                  {key}
                </Text>
                <Text
                  style={{
                    color: th.colors.mutedForeground,
                    fontFamily: th.font.regular,
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  ${price.input} in / ${price.output} out
                  {price.cache_read != null ? ` · $${price.cache_read} cache` : ""}
                </Text>
              </View>
              <IconButton
                icon="pencil"
                accessibilityLabel={t("costs.editPrice", { model: key })}
                onPress={() => openEditPrice(key, price)}
              />
            </View>
          ))
        ) : null}
      </View>

      {/* Cap & Alert Settings */}
      <Head>{t("costs.capSection")}</Head>
      <View
        style={{
          backgroundColor: th.colors.card,
          borderRadius: th.radius.md,
          marginHorizontal: 16,
          marginTop: 4,
          padding: 16,
          gap: 16,
        }}
      >
        <TextField
          label={t("costs.dailyCap")}
          value={displayCap}
          onChangeText={(v) => {
            capRef.current = v;
            setCapText(v);
          }}
          onBlur={handleCapBlur}
          placeholder="e.g. 5.00"
          keyboardType="numeric"
          autoCapitalize="none"
        />

        <TextField
          label={t("costs.alertPct")}
          value={displayAlertPct}
          onChangeText={(v) => {
            alertPctRef.current = v;
            setAlertPctText(v);
          }}
          onBlur={handleAlertPctBlur}
          placeholder="80"
          keyboardType="numeric"
          autoCapitalize="none"
        />
      </View>

      {/* Sheet for adding/editing a price */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetIsEdit ? t("costs.editPriceTitle") : t("costs.addPriceTitle")}
      >
        <View style={{ gap: 16, paddingBottom: 24 }}>
          <TextField
            label={t("costs.modelKey")}
            value={sheetModelKey}
            onChangeText={(v) => {
              sheetModelKeyRef.current = v;
              setSheetModelKey(v);
            }}
            placeholder="provider/model"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!sheetIsEdit}
          />

          <TextField
            label={t("costs.inputPrice")}
            value={sheetInputPrice}
            onChangeText={(v) => {
              sheetInputPriceRef.current = v;
              setSheetInputPrice(v);
            }}
            placeholder="e.g. 3.0"
            keyboardType="numeric"
            autoCapitalize="none"
          />

          <TextField
            label={t("costs.outputPrice")}
            value={sheetOutputPrice}
            onChangeText={(v) => {
              sheetOutputPriceRef.current = v;
              setSheetOutputPrice(v);
            }}
            placeholder="e.g. 15.0"
            keyboardType="numeric"
            autoCapitalize="none"
          />

          <TextField
            label={t("costs.cacheReadPrice")}
            value={sheetCacheReadPrice}
            onChangeText={(v) => {
              sheetCacheReadPriceRef.current = v;
              setSheetCacheReadPrice(v);
            }}
            placeholder="e.g. 0.3"
            keyboardType="numeric"
            autoCapitalize="none"
          />

          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                title={t("costs.save")}
                variant="primary"
                onPress={handleSavePrice}
              />
            </View>
            {sheetIsEdit ? (
              <Button
                title={t("costs.deletePrice")}
                variant="destructive"
                onPress={handleDeletePrice}
              />
            ) : null}
          </View>
        </View>
      </Sheet>
    </ScrollView>
  );
}
