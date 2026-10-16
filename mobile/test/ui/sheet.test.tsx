import React from "react";
import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Sheet } from "../../src/ui/components/Sheet";

const frame = {
  frame: { x: 0, y: 0, width: 390, height: 400 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderSheet(scroll?: boolean) {
  return render(
    <SafeAreaProvider initialMetrics={frame}>
      <ThemeProvider>
        <Sheet open onClose={() => undefined} title="Form" scroll={scroll}>
          <Text>Project name</Text>
          {Array.from({ length: 40 }, (_, i) => (
            <Text key={i}>{`row ${i}`}</Text>
          ))}
        </Sheet>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

type Node = { type: unknown; props: { style?: unknown; keyboardShouldPersistTaps?: string }; queryAll: (pred: (node: Node) => boolean) => Node[] };

/** KeyboardAvoidingView renders a View and adds bottom padding so the sheet stays above the keyboard. */
function keyboardWrap(root: Node) {
  return root.queryAll((node) => node.type === "View").find((node) => {
    const style = JSON.stringify(node.props.style ?? "");
    return style.includes('"justifyContent":"flex-end"') && style.includes("paddingBottom");
  });
}

function scrollers(root: Node) {
  return root.queryAll((node) => node.type === "RCTScrollView");
}

test("Sheet keeps its fields above the keyboard", async () => {
  const view = await renderSheet();
  const root = view.root as Node | null;
  if (!root) throw new Error("sheet did not render");
  expect(keyboardWrap(root)).toBeTruthy();
  expect(scrollers(root)[0]?.props.keyboardShouldPersistTaps).toBe("handled");
  expect(view.getByText("Project name")).toBeTruthy();
});

test("a sheet that scrolls itself is not wrapped again", async () => {
  const view = await renderSheet(false);
  const root = view.root as Node | null;
  if (!root) throw new Error("sheet did not render");
  expect(keyboardWrap(root)).toBeTruthy();
  expect(scrollers(root)).toHaveLength(0);
});
