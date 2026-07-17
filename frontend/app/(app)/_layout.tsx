import { Redirect, Stack } from "expo-router";
import { useMemo } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";

export default function AppLayout() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { token, user, isLoading } = useSession();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.debtRed} />
      </View>
    );
  }

  if (!token || !user) {
    return <Redirect href="/sign-in" />;
  }

  if (!user.is_active) {
    return <Redirect href="/subscription-lock" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.background } }} />;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
