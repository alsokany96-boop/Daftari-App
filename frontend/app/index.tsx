import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useSession } from "@/src/ctx/SessionProvider";
import { colors } from "@/src/theme";

export default function Index() {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
