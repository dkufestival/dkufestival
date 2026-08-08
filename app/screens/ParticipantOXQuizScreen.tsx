import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PlayceButton, PlayceHeading, PlayceLayout } from "./participant-ui";

type OXAnswer = "O" | "X";

export default function ParticipantOXQuizScreen() {
  const [answer, setAnswer] = useState<OXAnswer | null>(null);

  return (
    <PlayceLayout>
      <PlayceHeading>Question 1</PlayceHeading>

      <View style={styles.answerRow}>
        {(["O", "X"] as OXAnswer[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            onPress={() => setAnswer(item)}
            style={({ pressed }) => [
              styles.answerCard,
              answer === item && styles.selected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.answerText}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.bottomButton}>
        <PlayceButton label="제출" />
      </View>
    </PlayceLayout>
  );
}

const styles = StyleSheet.create({
  answerRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 141,
    paddingHorizontal: 9,
  },
  answerCard: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  answerText: {
    color: "#000",
    fontSize: 56,
    fontWeight: "500",
  },
  selected: {
    borderWidth: 4,
    borderColor: "#6ea8ff",
  },
  pressed: {
    opacity: 0.78,
  },
  bottomButton: {
    marginTop: "auto",
    paddingBottom: 91,
  },
});
