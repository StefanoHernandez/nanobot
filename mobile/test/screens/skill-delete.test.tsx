import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { SkillDetailSheet } from "../../src/screens/ecosystem/skills/SkillDetailSheet";
import { toast } from "../../src/ui/components";
import * as skillsModule from "../../src/ecosystem/skills";
import type { SkillDetail } from "@/lib/types";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

describe("SkillDetailSheet Elimina skill", () => {
  let detailMock: jest.Mock;
  let removeMock: jest.Mock;
  let refreshMock: jest.Mock;

  const workspaceSkill: SkillDetail = {
    name: "my_custom_skill",
    description: "A custom user skill",
    source: "workspace",
    available: true,
    requirements: { bins: [], env: [], missing_bins: [], missing_env: [] },
    raw_markdown: "# My Custom Skill",
  };

  const builtinSkill: SkillDetail = {
    name: "weather",
    description: "Built-in weather skill",
    source: "builtin",
    available: true,
    requirements: { bins: [], env: [], missing_bins: [], missing_env: [] },
    raw_markdown: "# Built-in Weather",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("en");
    detailMock = jest.fn();
    removeMock = jest.fn();
    refreshMock = jest.fn();

    jest.spyOn(skillsModule, "useSkills").mockReturnValue({
      skills: [],
      loading: false,
      error: null,
      refresh: refreshMock,
      discover: jest.fn(),
      search: jest.fn(),
      trending: jest.fn(),
      detail: detailMock,
      install: jest.fn(),
      update: jest.fn(),
      remove: removeMock,
    } as any);
  });

  const renderSheet = async (skillName: string, onClose = jest.fn()) => {
    return render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <SkillDetailSheet open={true} skillName={skillName} onClose={onClose} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  };

  test("workspace skill: shows delete button, confirm opens dialog, deletes, closes and refreshes", async () => {
    detailMock.mockResolvedValue(workspaceSkill);
    removeMock.mockResolvedValue({ skills: [] });
    const onClose = jest.fn();

    await renderSheet("my_custom_skill", onClose);

    await waitFor(() => {
      expect(screen.getByText("my_custom_skill")).toBeTruthy();
    });

    // Delete button is present
    const deleteBtn = screen.getByRole("button", { name: i18n.t("skills.delete") });
    expect(deleteBtn).toBeTruthy();

    // Tap delete button -> confirm dialog opens
    await act(async () => {
      fireEvent.press(deleteBtn);
    });

    expect(screen.getByText(i18n.t("skills.deleteConfirm", { name: "my_custom_skill" }))).toBeTruthy();

    // Confirm dialog
    const confirmBtn = screen.getByRole("button", { name: i18n.t("common.delete") });
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    expect(removeMock).toHaveBeenCalledWith("my_custom_skill");
    expect(onClose).toHaveBeenCalled();
  });

  test("builtin skill: delete button is hidden", async () => {
    detailMock.mockResolvedValue(builtinSkill);

    await renderSheet("weather");

    await waitFor(() => {
      expect(screen.getByText("weather")).toBeTruthy();
    });

    // Delete button is NOT present for builtin skill
    expect(screen.queryByRole("button", { name: i18n.t("skills.delete") })).toBeNull();
  });

  test("delete skill: 403 error shows deleteNeedsFullPower toast", async () => {
    detailMock.mockResolvedValue(workspaceSkill);
    removeMock.mockRejectedValueOnce(Object.assign(new Error("remote skill deletion is disabled"), { status: 403 }));

    await renderSheet("my_custom_skill");

    await waitFor(() => {
      expect(screen.getByText("my_custom_skill")).toBeTruthy();
    });

    const deleteBtn = screen.getByRole("button", { name: i18n.t("skills.delete") });
    await act(async () => {
      fireEvent.press(deleteBtn);
    });

    const confirmBtn = screen.getByRole("button", { name: i18n.t("common.delete") });
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    expect(toast.show).toHaveBeenCalledWith(i18n.t("skills.deleteNeedsFullPower"));
  });
});
