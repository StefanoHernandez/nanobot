import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as IntentLauncher from "expo-intent-launcher";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { prefs } from "../../src/settings/prefs";
import { kv } from "../../src/platform/storage";
import { keepAlive } from "../../src/platform/keepAlive";
import { startKeepAliveWiring } from "../../src/extras/keepAliveWiring";
import { AppearanceSection } from "../../src/screens/settings/AppearanceSection";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
const { modifyAndroidManifest, modifyMainApplication } = require("../../plugins/withKeepAlive");

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn(async () => ({})),
  ActivityAction: {
    IGNORE_BATTERY_OPTIMIZATION_SETTINGS: "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
  },
}));

jest.mock("../../src/platform/keepAlive", () => ({
  keepAlive: {
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    isRunning: jest.fn(async () => false),
    isIgnoringBatteryOptimizations: jest.fn(async () => true),
  },
  KeepAlive: {
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    isRunning: jest.fn(async () => false),
    isIgnoringBatteryOptimizations: jest.fn(async () => true),
  },
}));

beforeAll(async () => {
  await i18n.changeLanguage("it");
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of kv.keys()) {
    kv.del(k);
  }
  sessionStore.setState({ session: null, state: "none", profile: null });
});

describe("NT-D: keepAlive wiring", () => {
  test("starts the service on connect with pref on", async () => {
    prefs.setBackgroundConnection(true);
    const stopWiring = startKeepAliveWiring();

    await act(async () => {
      sessionStore.setState({ state: "open" });
    });

    expect(keepAlive.start).toHaveBeenCalledTimes(1);
    expect(keepAlive.stop).not.toHaveBeenCalled();

    stopWiring();
  });

  test("does not start the service on connect when pref is off", async () => {
    prefs.setBackgroundConnection(false);
    const stopWiring = startKeepAliveWiring();

    await act(async () => {
      sessionStore.setState({ state: "open" });
    });

    expect(keepAlive.start).not.toHaveBeenCalled();

    stopWiring();
  });

  test("stops the service on sign-out / session closed", async () => {
    prefs.setBackgroundConnection(true);
    sessionStore.setState({ state: "open" });
    const stopWiring = startKeepAliveWiring();

    expect(keepAlive.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      sessionStore.setState({ state: "none" });
    });

    expect(keepAlive.stop).toHaveBeenCalledTimes(1);

    stopWiring();
  });

  test("stops the service on auth_error", async () => {
    prefs.setBackgroundConnection(true);
    sessionStore.setState({ state: "open" });
    const stopWiring = startKeepAliveWiring();

    expect(keepAlive.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      sessionStore.setState({ state: "auth_error" });
    });

    expect(keepAlive.stop).toHaveBeenCalledTimes(1);

    stopWiring();
  });

  test("stops the service when the pref is turned off", async () => {
    prefs.setBackgroundConnection(true);
    sessionStore.setState({ state: "open" });
    const stopWiring = startKeepAliveWiring();

    expect(keepAlive.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      prefs.setBackgroundConnection(false);
    });

    expect(keepAlive.stop).toHaveBeenCalledTimes(1);

    stopWiring();
  });

  test("starts the service if pref is toggled on while session is connected", async () => {
    prefs.setBackgroundConnection(false);
    sessionStore.setState({ state: "open" });
    const stopWiring = startKeepAliveWiring();

    expect(keepAlive.start).not.toHaveBeenCalled();

    await act(async () => {
      prefs.setBackgroundConnection(true);
    });

    expect(keepAlive.start).toHaveBeenCalledTimes(1);

    stopWiring();
  });
});

describe("NT-D: settings switch and battery optimization", () => {
  test("switch toggles the pref and triggers wiring", async () => {
    prefs.setBackgroundConnection(true);
    sessionStore.setState({ state: "open" });
    const stopWiring = startKeepAliveWiring();

    await render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>,
    );

    const switchEl = screen.getByLabelText("Ricevi notifiche con l'app chiusa");
    expect(switchEl.props.value).toBe(true);

    await act(async () => {
      fireEvent(switchEl, "valueChange", false);
    });

    expect(prefs.backgroundConnection()).toBe(false);
    expect(keepAlive.stop).toHaveBeenCalled();

    stopWiring();
  });

  test("shows button to exempt battery optimization when optimization is active", async () => {
    (keepAlive.isIgnoringBatteryOptimizations as jest.Mock).mockResolvedValueOnce(false);
    prefs.setBackgroundConnection(true);

    await render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>,
    );

    // Wait for the async battery optimization check
    const exemptBtn = await screen.findByText("Disattiva ottimizzazione batteria");
    expect(exemptBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(exemptBtn);
    });

    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith(
      "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
    );
  });
});

describe("NT-D: withKeepAlive plugin", () => {
  test("modifies AndroidManifest with permissions and service", () => {
    const manifest = { manifest: { application: [{ $: {} }] } };
    const modified = modifyAndroidManifest(manifest);

    const permissions = modified.manifest["uses-permission"].map(
      (p: { $: { "android:name": string } }) => p.$["android:name"],
    );
    expect(permissions).toContain("android.permission.FOREGROUND_SERVICE");
    expect(permissions).toContain("android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING");

    const service = modified.manifest.application[0].service.find(
      (s: { $: { "android:name": string } }) => s.$["android:name"] === ".KeepAliveService",
    );
    expect(service).toBeDefined();
    expect(service.$["android:foregroundServiceType"]).toBe("remoteMessaging");
    expect(service.$["android:exported"]).toBe("false");
  });

  test("modifies MainApplication to register KeepAlivePackage", () => {
    const initialContent = `
class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }
}
`;
    const modified = modifyMainApplication(initialContent);
    expect(modified).toContain("add(KeepAlivePackage())");
  });
});
