import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SegmentedTabs } from "../../src/ui/components/SegmentedTabs";
import { ThemeProvider } from "../../src/ui/ThemeProvider";

const tabs = [
  { value: "a" as const, label: "Alpha" },
  { value: "b" as const, label: "Beta", accessibilityLabel: "Beta tab" },
  { value: "c" as const, label: "Gamma" },
];

const show = (value: "a" | "b" | "c", onChange = jest.fn()) =>
  render(
    <ThemeProvider>
      <SegmentedTabs tabs={tabs} value={value} onChange={onChange} />
    </ThemeProvider>,
  );

test("marks only the current tab as selected and reports a press", async () => {
  const onChange = jest.fn();
  await show("a", onChange);

  expect(screen.getByRole("tab", { name: "Alpha" }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole("tab", { name: "Beta tab" }).props.accessibilityState.selected).toBe(false);
  expect(screen.getByRole("tab", { name: "Gamma" }).props.accessibilityState.selected).toBe(false);

  fireEvent.press(screen.getByRole("tab", { name: "Gamma" }));
  expect(onChange).toHaveBeenCalledWith("c");
});

test("every tab keeps a 48 dp touch target", async () => {
  await show("b");
  for (const tab of screen.getAllByRole("tab")) {
    expect(tab.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ minHeight: 48 })]));
  }
});
