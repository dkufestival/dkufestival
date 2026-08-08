import { FontAwesome5, Ionicons, MaterialIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type PlayceLayoutProps = {
  children: ReactNode;
  showExit?: boolean;
};

type PlayceButtonProps = {
  label: string;
  onPress?: () => void;
  muted?: boolean;
};

export function PlayceLayout({ children, showExit = false }: PlayceLayoutProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        {showExit ? (
          <MaterialIcons name="logout" size={32} color="#fff" />
        ) : (
          <View style={styles.iconSlot} />
        )}
        <Ionicons name="notifications-outline" size={36} color="#fff" />
      </View>
      <Text style={styles.logo}>Playce</Text>
      {children}
    </SafeAreaView>
  );
}

export function PlayceHeading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function PlayceStatus({ children }: { children: ReactNode }) {
  return <Text style={styles.status}>{children}</Text>;
}

export function PlayceButton({ label, onPress, muted = false }: PlayceButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        muted && styles.mutedPill,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.pillText, muted && styles.mutedPillText]}>{label}</Text>
    </Pressable>
  );
}

export function PlayceInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#a9a9a9"
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function RpsCard({
  icon,
  selected,
  onPress,
}: {
  icon: "hand-rock" | "hand-peace" | "hand-paper";
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.rpsCard,
        selected && styles.selectedCard,
        pressed && styles.pressed,
      ]}
    >
      <FontAwesome5 name={icon} size={78} color="#000" />
    </Pressable>
  );
}

export function Spacer({ size }: { size: number }) {
  return <View style={{ height: size }} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 18,
  },
  topBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconSlot: {
    width: 36,
    height: 36,
  },
  logo: {
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 48,
    fontWeight: "900",
    lineHeight: 58,
    marginTop: 47,
    textAlign: "center",
  },
  heading: {
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 48,
    marginTop: 42,
    textAlign: "center",
  },
  status: {
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 30,
    textAlign: "center",
  },
  pill: {
    width: "100%",
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "#fff",
  },
  mutedPill: {
    opacity: 0.98,
  },
  pillText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  mutedPillText: {
    color: "#aaa",
  },
  input: {
    width: "100%",
    height: 46,
    borderRadius: 24,
    backgroundColor: "#fff",
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 17,
    textAlign: "center",
  },
  rpsCard: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  selectedCard: {
    borderWidth: 4,
    borderColor: "#6ea8ff",
  },
  pressed: {
    opacity: 0.78,
  },
});

export const playceStyles = styles;
