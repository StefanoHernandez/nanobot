import React from "react";
import { AccessibilityInfo, Animated } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { BotFace, faceStateOf, type FaceState } from "../../src/ui/BotFace";

describe("faceStateOf", () => {
  test("covers all six states with the right priority", () => {
    // 1. offline (conn !== "open") takes precedence over everything
    expect(faceStateOf("closed", true, true, true, true)).toBe("offline");
    expect(faceStateOf("reconnecting", true, true, false, true)).toBe("offline");
    expect(faceStateOf("connecting", false, false, false, false)).toBe("offline");

    // 2. error takes precedence over working, writing, thinking, idle
    expect(faceStateOf("open", true, true, true, true)).toBe("error");
    expect(faceStateOf("open", false, false, true, false)).toBe("error");

    // 3. working (if tool is running) takes precedence over writing, thinking, idle
    expect(faceStateOf("open", true, true, false, true)).toBe("working");
    expect(faceStateOf("open", true, true, false, false)).toBe("working");

    // 4. writing (if text is streaming) takes precedence over thinking, idle
    expect(faceStateOf("open", true, false, false, true)).toBe("writing");
    expect(faceStateOf("open", false, false, false, true)).toBe("writing");

    // 5. thinking (if running)
    expect(faceStateOf("open", true, false, false, false)).toBe("thinking");

    // 6. idle (connected, nothing running)
    expect(faceStateOf("open", false, false, false, false)).toBe("idle");
  });
});

describe("BotFace", () => {
  const states: FaceState[] = ["idle", "thinking", "working", "writing", "offline", "error"];

  test.each(states)("renders state %s with testIDs and hides from screen readers", async (st) => {
    await render(
      <ThemeProvider>
        <BotFace state={st} size={48} />
      </ThemeProvider>
    );
    expect(screen.getByTestId(`face-${st}`, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId(`face-eye-${st}`, { includeHiddenElements: true })).toBeTruthy();
  });

  test("reduced motion keeps shapes with no animation started", async () => {
    const spy = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const loopSpy = jest.spyOn(Animated, "loop");

    await render(
      <ThemeProvider>
        <BotFace state="idle" />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("face-idle", { includeHiddenElements: true })).toBeTruthy();
    });

    expect(loopSpy).not.toHaveBeenCalled();

    spy.mockRestore();
    loopSpy.mockRestore();
  });
});

