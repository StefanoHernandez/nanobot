import React from "react";
import { render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { BotFace, faceStateOf } from "../../src/ui/BotFace";

test("faceStateOf maps connection and turn state to the face", () => {
  expect(faceStateOf("reconnecting", true, true, false)).toBe("offline");
  expect(faceStateOf("open", false, false, true)).toBe("error");
  expect(faceStateOf("open", true, true, false)).toBe("working");
  expect(faceStateOf("open", true, false, false)).toBe("thinking");
  expect(faceStateOf("open", false, false, false)).toBe("idle");
});

test("BotFace renders the eyes for its state and hides from screen readers", async () => {
  await render(<ThemeProvider><BotFace state="offline" /></ThemeProvider>);
  expect(screen.getByTestId("face-eye-offline", { includeHiddenElements: true })).toBeTruthy();
});
