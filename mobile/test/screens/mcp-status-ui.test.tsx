import React from "react";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { McpPresetInfo } from "@/lib/types";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { McpTab } from "../../src/screens/ecosystem/apps/McpTab";
import { i18n } from "../../src/i18n";

const mockUseMcp = jest.fn();
jest.mock("../../src/ecosystem/mcp", () => ({
  useMcp: () => mockUseMcp(),
  useMcpOAuth: () => ({ status: "idle" }),
}));
jest.mock("../../src/ecosystem/privilege", () => ({ usePrivileged: () => true }));

const preset: McpPresetInfo = {
  name: "ctx",
  display_name: "Context7",
  category: "dev",
  description: "Demo",
  transport: "stdio",
  status: "configured",
  enabled: true,
  configured: true,
} as McpPresetInfo;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  mockUseMcp.mockReturnValue({
    presets: [preset],
    loading: false,
    refresh: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    remove: jest.fn(),
    test: jest.fn(),
    reconnect: jest.fn(),
    tools: jest.fn(),
  });
});

test("MCP card shows status line and no filled destructive remove button", async () => {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <McpTab />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  expect(screen.getByText("Active · Configured")).toBeTruthy();
  const remove = screen.getByText("Remove");
  const style = Array.isArray(remove.parent?.props.style) ? remove.parent.props.style.flat() : [remove.parent?.props.style];
  const bg = style.find((s: { backgroundColor?: string }) => s?.backgroundColor)?.backgroundColor;
  expect(bg === "transparent" || bg === undefined).toBe(true);
});
