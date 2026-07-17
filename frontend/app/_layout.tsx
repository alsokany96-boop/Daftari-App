import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, I18nManager, useColorScheme, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { SessionProvider } from "@/src/ctx/SessionProvider";
import { useColors } from "@/src/theme";

LogBox.ignoreAllLogs(true);

// Force RTL for Arabic app
try {
  I18nManager.allowRTL(true);
  if (!I18nManager.isRTL) {
    I18nManager.forceRTL(true);
  }
} catch {
  /* ignore */
}

SplashScreen.preventAutoHideAsync();

function ThemedRoot() {
  const scheme = useColorScheme();
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.background } }} />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <SessionProvider>
          <ThemedRoot />
        </SessionProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
