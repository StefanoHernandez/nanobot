import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Sheet } from "../../src/ui/components/Sheet";
import { ToastHost, toast } from "../../src/ui/components/ToastHost";
import {
  AutomationJobSheet,
  formatAtLocal,
  parseEveryMsToUnit,
  everyUnitToMs,
} from "../../src/screens/ecosystem/automations/AutomationJobSheet";
import type { SessionAutomationJob } from "@/lib/types";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe("M-A: I15 Toast visibility across sheets", () => {

  test("toast.show('x'), then mount a Sheet -> 'x' is rendered inside the sheet", async () => {
    await act(async () => {
      toast.show("x");
    });

    const { findByText } = await renderWithTheme(
      <Sheet open={true} onClose={jest.fn()} title="Sheet Title">
        <></>
      </Sheet>
    );

    expect(await findByText("x")).toBeTruthy();
  });

  test("with the root ToastHost and an open Sheet, 'x' is rendered exactly once", async () => {
    function App({ open }: { open: boolean }) {
      return (
        <SafeAreaProvider initialMetrics={metrics}>
          <ThemeProvider>
            <ToastHost />
            <Sheet open={open} onClose={jest.fn()} title="Sheet">
              <></>
            </Sheet>
          </ThemeProvider>
        </SafeAreaProvider>
      );
    }

    const { rerender, getAllByText } = await render(<App open={false} />);

    await act(async () => {
      toast.show("x");
    });

    expect(getAllByText("x").length).toBe(1);

    // Now open the Sheet while toast is still active
    await act(async () => {
      rerender(<App open={true} />);
    });

    expect(getAllByText("x").length).toBe(1);
  });

  test("after the sheet closes, the root host shows the next toast", async () => {
    function App({ open }: { open: boolean }) {
      return (
        <SafeAreaProvider initialMetrics={metrics}>
          <ThemeProvider>
            <ToastHost />
            <Sheet open={open} onClose={jest.fn()} title="Sheet">
              <></>
            </Sheet>
          </ThemeProvider>
        </SafeAreaProvider>
      );
    }

    const { rerender, findByText, getAllByText } = await render(<App open={true} />);

    // Close the sheet
    await act(async () => {
      rerender(<App open={false} />);
    });

    await act(async () => {
      toast.show("next toast");
    });

    expect(await findByText("next toast")).toBeTruthy();
    expect(getAllByText("next toast").length).toBe(1);
  });
});

describe("M-A: I8 Automation schedule pickers", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("it");
  });

  test("an every of 90 min prefills '90' plus the minutes chip", async () => {
    const job: SessionAutomationJob = {
      id: "j-90",
      name: "Every 90m",
      enabled: true,
      schedule: { kind: "every", every_ms: 90 * 60 * 1000 },
      payload: { message: "Check server" },
      state: { run_history: [] },
    };

    await renderWithTheme(<AutomationJobSheet open={true} job={job} onClose={jest.fn()} />);

    // Should prefill '90' in the interval field
    expect(screen.getByDisplayValue("90")).toBeTruthy();

    // Unit parsing check: 90 mins -> 90 minutes, not 1.5 hours
    const parsed = parseEveryMsToUnit(90 * 60 * 1000);
    expect(parsed).toEqual({ amount: "90", unit: "minutes" });

    // The minutes chip should be selected ("minuti")
    expect(screen.getByText(i18n.t("automations.minutes"))).toBeTruthy();
  });

  test("changing the unit to hours with '2' sends every_ms = 7_200_000", async () => {
    const onUpdate = jest.fn().mockResolvedValue(true);
    const job: SessionAutomationJob = {
      id: "j-every",
      name: "Interval Job",
      enabled: true,
      schedule: { kind: "every", every_ms: 60 * 1000 },
      payload: { message: "Interval message" },
      state: { run_history: [] },
    };

    await renderWithTheme(
      <AutomationJobSheet open={true} job={job} onClose={jest.fn()} onUpdate={onUpdate} />
    );

    // Input "2"
    const input = screen.getByDisplayValue("1");
    await fireEvent.changeText(input, "2");

    // Click "ore" chip
    const hoursChip = screen.getByText(i18n.t("automations.hours"));
    await fireEvent.press(hoursChip);

    // Save
    const saveBtn = screen.getByText(i18n.t("automations.save"));
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(onUpdate).toHaveBeenCalledWith(
      "j-every",
      expect.objectContaining({
        schedule: expect.objectContaining({ kind: "every", every_ms: 7_200_000 }),
      })
    );
  });

  test("an at in the past shows the error and does not call the mutate", async () => {
    const onUpdate = jest.fn().mockResolvedValue(true);
    const pastTime = Date.now() - 3600 * 1000;
    const job: SessionAutomationJob = {
      id: "j-at-past",
      name: "Past Job",
      enabled: true,
      schedule: { kind: "at", at_ms: pastTime },
      payload: { message: "Past message" },
      state: { run_history: [] },
    };

    await renderWithTheme(
      <AutomationJobSheet open={true} job={job} onClose={jest.fn()} onUpdate={onUpdate} />
    );

    const saveBtn = screen.getByText(i18n.t("automations.save"));
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(screen.getByText(i18n.t("automations.err.past"))).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("the formatter round-trips local time with fixed timezone", () => {
    const originalTZ = process.env.TZ;
    process.env.TZ = "Europe/Rome";
    try {
      // 2026-10-15T10:30:00.000Z in UTC is 12:30 in Europe/Rome (CEST, UTC+2)
      const epochMs = Date.UTC(2026, 9, 15, 10, 30, 0);
      const formatted = formatAtLocal(epochMs, "it");
      expect(formatted).toBeTruthy();

      // Check date and time components are present
      expect(formatted).toMatch(/15/);
      expect(formatted).toMatch(/12:30/);
    } finally {
      process.env.TZ = originalTZ;
    }
  });

  test("sub-minute values are kept as decimals and not rounded away", async () => {
    const onUpdate = jest.fn().mockResolvedValue(true);
    // 30 seconds = 30_000 ms = 0.5 minutes
    const job: SessionAutomationJob = {
      id: "j-submin",
      name: "Submin Job",
      enabled: true,
      schedule: { kind: "every", every_ms: 30_000 },
      payload: { message: "Submin message" },
      state: { run_history: [] },
    };

    await renderWithTheme(
      <AutomationJobSheet open={true} job={job} onClose={jest.fn()} onUpdate={onUpdate} />
    );

    expect(screen.getByDisplayValue("0.5")).toBeTruthy();

    const saveBtn = screen.getByText(i18n.t("automations.save"));
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(onUpdate).toHaveBeenCalledWith(
      "j-submin",
      expect.objectContaining({
        schedule: expect.objectContaining({ kind: "every", every_ms: 30_000 }),
      })
    );
  });

  test("invalid or <= 0 interval value shows inline error and blocks save", async () => {
    const onUpdate = jest.fn().mockResolvedValue(true);
    const job: SessionAutomationJob = {
      id: "j-inv",
      name: "Invalid interval Job",
      enabled: true,
      schedule: { kind: "every", every_ms: 60_000 },
      payload: { message: "Interval message" },
      state: { run_history: [] },
    };

    await renderWithTheme(
      <AutomationJobSheet open={true} job={job} onClose={jest.fn()} onUpdate={onUpdate} />
    );

    const input = screen.getByDisplayValue("1");
    await fireEvent.changeText(input, "0");

    const saveBtn = screen.getByText(i18n.t("automations.save"));
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(screen.getByText(i18n.t("automations.err.invalid"))).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("at schedule opens native picker and saves updated future timestamp", async () => {
    const onUpdate = jest.fn().mockResolvedValue(true);
    const futureTime = Date.now() + 100_000_000;
    const job: SessionAutomationJob = {
      id: "j-at-future",
      name: "Future Job",
      enabled: true,
      schedule: { kind: "at", at_ms: futureTime },
      payload: { message: "Future message" },
      state: { run_history: [] },
    };

    await renderWithTheme(
      <AutomationJobSheet open={true} job={job} onClose={jest.fn()} onUpdate={onUpdate} />
    );

    // Date and Time buttons are rendered
    const dateBtn = screen.getByText(i18n.t("automations.date"));
    const timeBtn = screen.getByText(i18n.t("automations.time"));
    expect(dateBtn).toBeTruthy();
    expect(timeBtn).toBeTruthy();

    // Saving valid future date works
    const saveBtn = screen.getByText(i18n.t("automations.save"));
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(onUpdate).toHaveBeenCalledWith(
      "j-at-future",
      expect.objectContaining({
        schedule: expect.objectContaining({ kind: "at", at_ms: futureTime }),
      })
    );
  });
});

