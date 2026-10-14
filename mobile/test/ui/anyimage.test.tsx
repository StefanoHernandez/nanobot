import React from "react";
import { render, screen } from "@testing-library/react-native";
import { AnyImage, isSvg } from "../../src/ui/AnyImage";

jest.mock("react-native-svg", () => {
  const { Text } = require("react-native");
  return { SvgUri: ({ uri }: { uri: string }) => <Text>{`svg:${uri}`}</Text> };
});

test("isSvg uses the file name first (server sends octet-stream URLs)", () => {
  expect(isSvg("https://h/api/media/sig/abc", "chart.SVG")).toBe(true);
  expect(isSvg("https://h/api/media/sig/x.svg?t=1")).toBe(true);
  expect(isSvg("https://h/api/media/sig/x.png", "x.png")).toBe(false);
});

test("SVG renders through react-native-svg, raster through Image", async () => {
  await render(<AnyImage url="https://h/m/a" name="a.svg" testID="i" />);
  expect(screen.getByText("svg:https://h/m/a")).toBeTruthy();
  await render(<AnyImage url="https://h/m/b" name="b.png" testID="p" />);
  expect(screen.queryByText("svg:https://h/m/b")).toBeNull();
});
