import { Redirect, Stack } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useSession } from "@/src/ctx/SessionProvider";
import { colors } from "@/src/theme";

export default function AppLayout() {
  const { token, isLoading } = useSession();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.debtRed} />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/sign-in" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
