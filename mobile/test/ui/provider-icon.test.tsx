import React from "react";
import { render, screen } from "@testing-library/react-native";
import { ProviderIcon } from "../../src/ui/ProviderIcon";

describe("ProviderIcon", () => {
  test("a known provider renders its SVG", async () => {
    await render(<ProviderIcon provider="anthropic" label="Anthropic" />);
    expect(screen.getByTestId("provider-icon-anthropic")).toBeTruthy();
  });

  test("openai renders its SVG", async () => {
    await render(<ProviderIcon provider="openai" label="OpenAI" />);
    expect(screen.getByTestId("provider-icon-openai")).toBeTruthy();
  });

  test("gemini renders its SVG", async () => {
    await render(<ProviderIcon provider="gemini" label="Google Gemini" />);
    expect(screen.getByTestId("provider-icon-gemini")).toBeTruthy();
  });

  test("deepseek renders its SVG", async () => {
    await render(<ProviderIcon provider="deepseek" label="DeepSeek" />);
    expect(screen.getByTestId("provider-icon-deepseek")).toBeTruthy();
  });

  test("an unknown one renders the letter", async () => {
    await render(<ProviderIcon provider="unknown_llm" label="My Custom LLM" />);
    expect(screen.getByTestId("provider-icon-letter")).toBeTruthy();
    expect(screen.getByText("M")).toBeTruthy();
  });
});
