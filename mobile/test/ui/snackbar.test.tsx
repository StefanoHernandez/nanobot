import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Sheet } from "../../src/ui/components/Sheet";
import { SNACKBAR_MS, ToastHost, snackbarBottom, toast } from "../../src/ui/components/ToastHost";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function renderHost() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <ToastHost />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  toast.show("");
  toast.setLift(0);
});

test("snackbarBottom stays at the safe edge, adds only uncovered keyboard, and lifts for the composer", () => {
  expect(snackbarBottom({ insetBottom: 24, keyboardHeight: 0, windowHeight: 800, screenHeight: 800, lift: 0 })).toBe(40);
  expect(snackbarBottom({ insetBottom: 0, keyboardHeight: 300, windowHeight: 500, screenHeight: 800, lift: 0 })).toBe(16);
  expect(snackbarBottom({ insetBottom: 0, keyboardHeight: 300, windowHeight: 800, screenHeight: 800, lift: 0 })).toBe(316);
  expect(snackbarBottom({ insetBottom: 0, keyboardHeight: 0, windowHeight: 800, screenHeight: 800, lift: 72 })).toBe(80);
});

test("a snackbar is one line, lasts 4s, and an action runs once then dismisses", async () => {
  await renderHost();
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  try {
    const onPress = jest.fn();
    await act(async () => {
      toast.show("Saved", { action: { label: "Undo", onPress } });
    });
    const line = screen.getByText("Saved");
    expect(line.props.numberOfLines).toBe(1);
    await act(async () => {
      jest.advanceTimersByTime(SNACKBAR_MS - 1);
    });
    expect(screen.getByText("Saved")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Saved")).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

function bottomOf(): number {
  const style = screen.getByTestId("snackbar").props.style;
  const parts = Array.isArray(style) ? style : [style];
  const found = parts.find((part) => part && typeof part === "object" && "bottom" in part) as { bottom: number } | undefined;
  return found?.bottom ?? -1;
}

test("the composer lift raises the root bar and a sheet ignores it", async () => {
  function App({ sheet }: { sheet: boolean }) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <ToastHost />
          {sheet ? (
            <Sheet open onClose={jest.fn()} title="Sheet">
              <></>
            </Sheet>
          ) : null}
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  const view = await render(<App sheet={false} />);
  await act(async () => {
    toast.show("hello");
    toast.setLift(90);
  });
  expect(bottomOf()).toBe(98);

  await act(async () => {
    view.rerender(<App sheet={true} />);
  });
  expect(screen.getAllByText("hello")).toHaveLength(1);
  expect(bottomOf()).toBe(16);
});
