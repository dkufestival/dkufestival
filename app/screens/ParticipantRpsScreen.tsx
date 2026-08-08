import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { PlayceButton, PlayceHeading, PlayceLayout, RpsCard } from "./participant-ui";

type RpsChoice = "rock" | "scissors" | "paper";

const choices: { value: RpsChoice; icon: "hand-rock" | "hand-peace" | "hand-paper" }[] = [
  { value: "rock", icon: "hand-rock" },
  { value: "scissors", icon: "hand-peace" },
  { value: "paper", icon: "hand-paper" },
];

export default function ParticipantRpsScreen() {
  const [choice, setChoice] = useState<RpsChoice | null>(null);

  return (
    <PlayceLayout>
      <PlayceHeading>Round 1</PlayceHeading>

      <View style={styles.choiceRow}>
        {choices.map((item) => (
          <RpsCard
            key={item.value}
            icon={item.icon}
            selected={choice === item.value}
            onPress={() => setChoice(item.value)}
          />
        ))}
      </View>

      <View style={styles.bottomButton}>
        <PlayceButton label="제출" />
      </View>
    </PlayceLayout>
  );
}

const styles = StyleSheet.create({
  choiceRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 83,
  },
  bottomButton: {
    marginTop: "auto",
    paddingBottom: 91,
  },
});
