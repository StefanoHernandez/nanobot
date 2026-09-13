import { useState, type ComponentProps } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import {
  installSettingsViewTestHooks,
  renderSettingsView,
  settingsPayload,
} from "@/tests/settings-test-utils";

function mockMobileMedia(initial = true) {
  const target = new EventTarget();
  const media = {
    matches: initial,
    media: "(max-width: 1023px)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return (matches: boolean) => act(() => {
    media.matches = matches;
    target.dispatchEvent(new Event("change"));
  });
}

function Sidebar(props: Partial<ComponentProps<typeof SettingsSidebar>>) {
  const [section, setSection] = useState(props.activeSection ?? "models");
  return <SettingsSidebar activeSection={section} onSelectSection={setSection}
    onBackToChat={() => {}} {...props} />;
}

describe("Settings navigation on mobile", () => {
  installSettingsViewTestHooks();

  it("keeps only back and the current section in the header; selects sections in a sheet", async () => {
    mockMobileMedia();
    const user = userEvent.setup();
    const restart = vi.fn();
    const back = vi.fn();
    render(<Sidebar onRestart={restart} onBackToChat={back} />);
    const header = screen.getByRole("complementary");
    expect(within(header).getAllByRole("button")).toHaveLength(2);
    const trigger = screen.getByRole("button", { name: "Settings: Models" });
    await user.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Settings" });
    expect(within(sheet).getByRole("button", { name: "Models", exact: true }))
      .toHaveAttribute("aria-current", "page");
    expect(within(sheet).getByRole("navigation", { name: "Settings sections" })).toBeVisible();
    expect(within(sheet).getByRole("button", { name: "Restart" })).toBeVisible();
    await user.click(within(sheet).getByRole("button", { name: "Appearance" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Settings: Appearance" })).toHaveFocus();
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(restart).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back to chat" }));
    expect(back).toHaveBeenCalledOnce();
  });

  it("treats capability subpages as the same navigation section", async () => {
    mockMobileMedia();
    const user = userEvent.setup();
    render(<Sidebar activeSection="image" />);
    await user.click(screen.getByRole("button", { name: "Settings: Capabilities" }));
    expect(screen.getByRole("button", { name: "Capabilities", exact: true }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Restart" })).not.toBeInTheDocument();
  });

  it.each(["close", "escape", "outside"])("dismisses with %s and restores focus and pointer events", async (method) => {
    mockMobileMedia();
    const user = userEvent.setup();
    render(<Sidebar />);
    const trigger = screen.getByRole("button", { name: "Settings: Models" });
    await user.click(trigger);
    if (method === "close") await user.click(screen.getByRole("button", { name: "Close" }));
    else if (method === "escape") await user.keyboard("{Escape}");
    else {
      // The real overlay is outside the modal content; ignore the locked page behind it.
      const overlay = document.querySelector<HTMLElement>('[data-state="open"][aria-hidden="true"]');
      expect(overlay).not.toBeNull();
      await user.click(overlay!);
    }
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("keeps manual restart in the sheet and closes it before handing off", async () => {
    mockMobileMedia();
    const user = userEvent.setup();
    const restart = vi.fn();
    render(<Sidebar onRestart={restart} />);
    expect(screen.queryByRole("button", { name: "Restart" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings: Models" }));
    await user.click(screen.getByRole("button", { name: "Restart" }));
    expect(restart).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("shows pending changes inline, disables restart while running, and clears the prompt after restart", async () => {
    mockMobileMedia();
    const user = userEvent.setup();
    const restart = vi.fn();
    const { rerender } = render(<Sidebar onRestart={restart} restartPending />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved. Restart to apply changes.");
    await user.click(screen.getByRole("button", { name: "Restart", exact: true }));
    expect(restart).toHaveBeenCalledOnce();
    rerender(<Sidebar onRestart={restart} restartPending isRestarting />);
    const runningLabel = screen.getByRole("status").textContent!;
    expect(screen.getByRole("button", { name: runningLabel, exact: true })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Settings: Models" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: runningLabel })).toBeDisabled();
    await user.keyboard("{Escape}");
    rerender(<Sidebar onRestart={restart} restartPending={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restart" })).not.toBeInTheDocument();
  });

  it("releases the open sheet when crossing to desktop and does not reopen on return", async () => {
    const resize = mockMobileMedia();
    const user = userEvent.setup();
    const restart = vi.fn();
    render(<Sidebar onRestart={restart} />);
    await user.click(screen.getByRole("button", { name: "Settings: Models" }));
    resize(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(screen.queryByRole("button", { name: "Settings: Models" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Models", exact: true })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restart" }));
    expect(restart).toHaveBeenCalledOnce();
    resize(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings: Models" })).toBeVisible();
  });

  it("still asks before leaving saved changes that need a restart", async () => {
    mockMobileMedia();
    const user = userEvent.setup();
    const back = vi.fn();
    renderSettingsView({ initialSection: "models", initialSettings: {
      ...settingsPayload(), requires_restart: true,
    }, onBackToChat: back });
    await user.click(screen.getByRole("button", { name: "Settings: Models" }));
    await user.click(screen.getByRole("button", { name: "Appearance", exact: true }));
    await user.click(screen.getByRole("button", { name: "Back to chat" }));
    const dialog = screen.getByRole("dialog", { name: "Restart before leaving?" });
    expect(back).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Restart later" }));
    expect(back).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe("none"));
  });
});
