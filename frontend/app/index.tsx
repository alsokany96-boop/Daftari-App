import { Redirect } from "expo-router";
import { useMemo } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";

export default function Index() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { token, user, isLoading } = useSession();

  if (isLoading) {
    return (
      <View style={styles.container} testID="root-loading">
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

  if (user.role === "super_admin") {
    return <Redirect href="/(app)/admin" />;
  }

  return <Redirect href="/(app)/home" />;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
