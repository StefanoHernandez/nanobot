import "../../src/platform/install";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { GalleryScreen } from "../../src/screens/gallery/GalleryScreen";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { fakeSession } from "../state/fake";
import type { UIMessage } from "@/lib/types";
import { router } from "expo-router";
import { artifactStore } from "../../src/screens/viewer/artifactStore";
import { toast } from "../../src/ui/components/Toast";
import * as projectsApi from "../../src/projects/api";
import { artifactUploadFileName } from "../../src/screens/gallery/galleryArtifacts";

jest.mock("../../src/ui/components/Toast", () => ({
  toast: { show: jest.fn() },
}));

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({ key: "websocket:c1" })),
}));

const written: unknown[][] = [];
jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({ create: jest.fn() })),
  File: jest.fn(function FileMock(_dir: unknown, name: string) {
    return {
      write: (...args: unknown[]) => {
        written.push([name, ...args]);
      },
      uri: `file:///cache/artifacts/${name}`,
    };
  }),
  Paths: { cache: { uri: "file:///cache" } },
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  jest.clearAllMocks();
  written.length = 0;
  artifactStore.clear();
});

const wrap = async (ui: React.ReactElement) => {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
};

function seedThread(key: string, messages: UIMessage[]) {
  threadStore.setState({
    threads: {
      [key]: {
        messages,
        running: false,
        model: null,
        preset: null,
        notices: [],
        draft: "",
        loaded: true,
        stopped: false,
        sendError: null,
        uploading: false,
        pendingFiles: [],
        forkBoundary: null,
        temporary: false,
      },
    },
  });
}

test("explicit chart artifact uploads as .vl", () => {
  expect(
    artifactUploadFileName({
      id: "sales",
      explicit: true,
      versions: [{ kind: "chart", code: '{"data":{"values":[]},"mark":"bar"}' }],
    }),
  ).toBe("sales.vl");
});

test("explicit map artifact uploads as .geojson", () => {
  expect(
    artifactUploadFileName({
      id: "places",
      explicit: true,
      versions: [{ kind: "map", code: '{"type":"FeatureCollection","features":[]}' }],
    }),
  ).toBe("places.geojson");
});

describe("GalleryScreen artifacts tab", () => {
  test("two versions of one explicit artifact show one row with latest title and kind", async () => {
    const key = "websocket:c1";
    sessionStore.setState({
      profile: { baseUrl: "http://example.com" } as never,
      session: fakeSession().session,
      state: "open" as never,
    });

    const secretSource = "<div>SECRET_SOURCE_v2</div>";
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        content: '```html id=sales-dash title="Old title"\n<div>v1</div>\n```',
        createdAt: 100,
      } as never,
      {
        id: "m2",
        role: "assistant",
        content: `\`\`\`html id=sales-dash title="Latest title"\n${secretSource}\n\`\`\``,
        createdAt: 200,
      } as never,
    ];
    seedThread(key, messages);

    await wrap(<GalleryScreen chatKey={key} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Artifacts" }));

    const rows = screen.getAllByTestId("gallery-artifact-row");
    expect(rows).toHaveLength(1);
    expect(screen.getByText("Latest title")).toBeTruthy();
    expect(screen.getByText("html")).toBeTruthy();
  });

  test("tapping a row opens preview without source in route params", async () => {
    const key = "websocket:c1";
    sessionStore.setState({
      profile: { baseUrl: "http://example.com" } as never,
      session: fakeSession().session,
      state: "open" as never,
    });

    const secretSource = "<div>SECRET_SOURCE</div>";
    seedThread(key, [
      {
        id: "m1",
        role: "assistant",
        content: `\`\`\`html id=dash title="Dash"\n${secretSource}\n\`\`\``,
        createdAt: 100,
      } as never,
    ]);

    await wrap(<GalleryScreen chatKey={key} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Artifacts" }));
    await fireEvent.press(screen.getByTestId("gallery-artifact-row"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/viewer",
      params: { name: "preview.html", chat: key },
    });
    const pushArg = (router.push as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(pushArg)).not.toContain("SECRET_SOURCE");
    expect(artifactStore.get()?.content).toContain("SECRET_SOURCE");
  });

  test("save uploads with a safe filename and success toast omits source", async () => {
    const key = "websocket:c1";
    const fake = fakeSession();
    sessionStore.setState({
      profile: { baseUrl: "http://example.com" } as never,
      session: fake.session,
      state: "open" as never,
    });

    const secretSource = "<svg>SECRET_SVG</svg>";
    seedThread(key, [
      {
        id: "m1",
        role: "assistant",
        content: `\`\`\`svg id=chart-a title="Chart"\n${secretSource}\n\`\`\``,
        createdAt: 100,
      } as never,
    ]);

    jest.spyOn(projectsApi, "listProjects").mockResolvedValue({
      projects: [
        {
          id: "proj-1",
          name: "Demo",
          path: "/p/demo",
          created_at: 1,
          updated_at: 1,
          file_count: 0,
          size_bytes: 0,
        },
      ],
    });
    const uploadSpy = jest.spyOn(projectsApi, "uploadProjectFile").mockResolvedValue({
      file: { path: "chart-a.svg", size: 10, modified_at: 1 },
    });

    await wrap(<GalleryScreen chatKey={key} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Artifacts" }));
    await fireEvent.press(screen.getByLabelText("Save to project"));

    await waitFor(() => {
      expect(screen.getByTestId("gallery-save-project-row")).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId("gallery-save-project-row"));

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalled();
    });

    const [, projectId, relPath, localFile] = uploadSpy.mock.calls[0];
    expect(projectId).toBe("proj-1");
    expect(relPath).toBe("chart-a.svg");
    expect(relPath).not.toContain("..");
    expect(localFile.name).toBe("chart-a.svg");
    expect(localFile.mime).toBe("image/svg+xml");

    expect(toast.show).toHaveBeenCalledWith("Saved to project");
    for (const call of (toast.show as jest.Mock).mock.calls) {
      expect(String(call[0])).not.toContain("SECRET_SVG");
      expect(String(call[0])).not.toContain("file://");
    }
  });
});
