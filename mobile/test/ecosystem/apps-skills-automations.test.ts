import "../../src/platform/install";
import { act, renderHook } from "@testing-library/react-native";
import { useCliApps, useFeatures } from "../../src/ecosystem/apps";
import { useMcp, useMcpOAuth } from "../../src/ecosystem/mcp";
import { useSkills } from "../../src/ecosystem/skills";
import { fetchAutomationChats, fetchAutomationRunResult, groupByDay, useAutomations } from "../../src/ecosystem/automations";
import type { SessionAutomationJob } from "@/lib/types";

const mockSession = { get: jest.fn() };
jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({ session: mockSession }),
}));

const mockMutate = jest.fn();
let mockSettingsData: any = { runtime_config: { "tools.webui_allow_remote_package_install": false } };

jest.mock("../../src/settings/store", () => ({
  useSettings: () => ({
    data: mockSettingsData,
    mutate: mockMutate,
  }),
}));

beforeEach(() => {
  mockMutate.mockReset();
  mockSession.get.mockReset();
  mockSettingsData = { runtime_config: { "tools.webui_allow_remote_package_install": false } };
  jest.useRealTimers();
});

describe("P4-C2: Apps, MCP, Skills, Automations logic", () => {
  test("install with the gate off: no mutate call and a policy error", async () => {
    mockSettingsData = { runtime_config: { "tools.webui_allow_remote_package_install": false } };
    mockSession.get.mockResolvedValue({ apps: [] });

    const { result } = await renderHook(() => useCliApps());

    await expect(result.current.install("my-app")).rejects.toMatchObject({ policy: true });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  test("install with the gate on: mutate is called with timeoutMs: 150000", async () => {
    mockSettingsData = { runtime_config: { "tools.webui_allow_remote_package_install": true } };
    mockSession.get.mockResolvedValue({ apps: [] });
    mockMutate.mockResolvedValue({ apps: [{ name: "my-app", installed: true }] });

    const { result } = await renderHook(() => useCliApps());

    await act(async () => {
      await result.current.install("my-app");
    });

    expect(mockMutate).toHaveBeenCalledWith(
      "settings.cli_app.install",
      { name: "my-app" },
      { timeoutMs: 150_000 },
    );
  });

  test("a 504 triggers a re-fetch", async () => {
    mockSettingsData = { runtime_config: { "tools.webui_allow_remote_package_install": true } };
    mockSession.get.mockResolvedValue({ apps: [] });
    mockMutate.mockRejectedValue({ status: 504 });

    const { result } = await renderHook(() => useCliApps());

    expect(mockSession.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.install("heavy-app");
    });

    // Initial fetch on mount + re-fetch after 504 timeout = 2 calls
    expect(mockSession.get).toHaveBeenCalledTimes(2);
  });

  test("Object.keys of the useMcp() result contains no custom or import action", async () => {
    mockSession.get.mockResolvedValue({ presets: [] });

    const { result } = await renderHook(() => useMcp());
    const keys = Object.keys(result.current);

    expect(keys).not.toContain("custom");
    expect(keys).not.toContain("saveCustom");
    expect(keys).not.toContain("saveCustomMcpServer");
    expect(keys).not.toContain("import");
    expect(keys).not.toContain("importConfig");
    expect(keys).not.toContain("importMcpConfig");
    expect(keys).not.toContain("import_cursor");
    expect(keys).not.toContain("importCursor");
  });

  test("the MCP OAuth callback_url is sent once, then polled to done, and expiry stops the polling", async () => {
    jest.useFakeTimers();
    mockMutate
      .mockResolvedValueOnce({ flow_id: "f1", status: "authorization_required", expires_in: 5, completion_input: "callback_url" }) // start
      .mockResolvedValueOnce({ flow_id: "f1", status: "pending" }); // complete

    mockSession.get
      .mockResolvedValueOnce({ flow_id: "f1", status: "pending" })
      .mockResolvedValueOnce({ flow_id: "f1", status: "connected" });

    const { result } = await renderHook(() => useMcpOAuth("linear"));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("awaiting_user");

    // Submit callback URL once
    await act(async () => {
      await result.current.submit("https://example.com/oauth?code=123");
    });

    expect(mockMutate).toHaveBeenCalledWith("settings.mcp.oauth_complete", {
      flow_id: "f1",
      callback_url: "https://example.com/oauth?code=123",
    });

    // Polls to done
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2500);
    });

    expect(result.current.state).toBe("done");

    // Verify expiry stops polling
    mockMutate
      .mockResolvedValueOnce({ flow_id: "f2", status: "authorization_required", expires_in: 1, completion_input: "callback_url" })
      .mockResolvedValueOnce({ flow_id: "f2", status: "pending" });
    mockSession.get.mockResolvedValue({ flow_id: "f2", status: "pending" });

    const { result: expResult } = await renderHook(() => useMcpOAuth("github"));
    await act(async () => {
      await expResult.current.start();
      await expResult.current.submit("https://example.com/oauth?code=456");
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });

    expect(expResult.current.state).toBe("error");
    expect(expResult.current.error).toBe("expired");
  });

  test("the useSkills() result has no delete", async () => {
    mockSession.get.mockResolvedValue({ skills: [] });

    const { result } = await renderHook(() => useSkills());
    const keys = Object.keys(result.current);

    expect(keys).not.toContain("delete");
    expect(keys).not.toContain("deleteSkill");
    expect(keys).not.toContain("remove");
  });

  test("run(id) sends exactly one automation.run, then fetches the result", async () => {
    mockSession.get
      .mockResolvedValueOnce({ jobs: [{ id: "job-1", name: "Job 1", kind: "cron", state: { run_history: [] } }] })
      .mockResolvedValueOnce({ response: "Job executed successfully" }); // fetchAutomationRunResult

    mockMutate.mockResolvedValueOnce({
      jobs: [
        {
          id: "job-1",
          name: "Job 1",
          kind: "cron",
          state: { run_history: [{ run_at_ms: 1700000000000, status: "ok" }] },
        },
      ],
    });

    const { result } = await renderHook(() => useAutomations());

    await act(async () => {
      await result.current.run("job-1");
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith("automation.run", { id: "job-1" });
    expect(mockSession.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/webui/automations/result?id=job-1"),
    );
  });

  test("groupByDay ordering, including today, tomorrow and later, with jobs inside a day sorted by time", () => {
    const baseDate = new Date("2026-10-13T12:00:00Z");
    const now = baseDate.getTime();

    // today: 2 hours from now and 5 hours from now
    const jobTodayLate: SessionAutomationJob = {
      id: "j1",
      name: "Today late",
      enabled: true,
      schedule: { kind: "at" },
      payload: { message: "run" },
      state: { next_run_at_ms: now + 5 * 3600 * 1000 },
    };
    const jobTodayEarly: SessionAutomationJob = {
      id: "j2",
      name: "Today early",
      enabled: true,
      schedule: { kind: "at" },
      payload: { message: "run" },
      state: { next_run_at_ms: now + 2 * 3600 * 1000 },
    };

    // tomorrow: 26 hours from now
    const jobTomorrow: SessionAutomationJob = {
      id: "j3",
      name: "Tomorrow",
      enabled: true,
      schedule: { kind: "at" },
      payload: { message: "run" },
      state: { next_run_at_ms: now + 26 * 3600 * 1000 },
    };

    // later: 4 days from now
    const jobLater: SessionAutomationJob = {
      id: "j4",
      name: "Later",
      enabled: true,
      schedule: { kind: "at" },
      payload: { message: "run" },
      state: { next_run_at_ms: now + 4 * 24 * 3600 * 1000 },
    };

    const jobs = [jobLater, jobTodayLate, jobTomorrow, jobTodayEarly];
    const grouped = groupByDay(jobs, now);

    // Check day groups ordering
    expect(grouped.today).toHaveLength(2);
    expect(grouped.today[0].name).toBe("Today early");
    expect(grouped.today[1].name).toBe("Today late");

    expect(grouped.tomorrow).toHaveLength(1);
    expect(grouped.tomorrow[0].name).toBe("Tomorrow");

    expect(grouped.later).toHaveLength(1);
    expect(grouped.later[0].name).toBe("Later");
  });

  test("the automation update payload keys are snake_case", async () => {
    mockSession.get.mockResolvedValue({ jobs: [] });
    mockMutate.mockResolvedValue({ jobs: [] });

    const { result } = await renderHook(() => useAutomations());

    await act(async () => {
      await result.current.update("job-1", {
        name: "Renamed",
        schedule: {
          kind: "at",
          at_ms: 1700000000000,
        },
      });
    });

    expect(mockMutate).toHaveBeenCalledWith("automation.update", {
      id: "job-1",
      values: {
        name: "Renamed",
        schedule: {
          kind: "at",
          at_ms: 1700000000000,
        },
      },
    });

    const calledValues = mockMutate.mock.calls[0][1].values;
    expect(calledValues).not.toHaveProperty("atMs");
    expect(calledValues).not.toHaveProperty("everyMs");
    expect(calledValues.schedule).toHaveProperty("at_ms");
  });
});
