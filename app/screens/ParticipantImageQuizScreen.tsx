import { StyleSheet, Text, View } from "react-native";

import { PlayceButton, PlayceInput, PlayceLayout } from "./participant-ui";

export default function ParticipantImageQuizScreen() {
  return (
    <PlayceLayout>
      <View style={styles.imageBox}>
        <Text style={styles.imageLabel}>사진 1</Text>
      </View>

      <View style={styles.bottomArea}>
        <PlayceInput placeholder="답안을 작성하세요" />
        <PlayceButton label="제출" />
      </View>
    </PlayceLayout>
  );
}

const styles = StyleSheet.create({
  imageBox: {
    width: "80%",
    aspectRatio: 1,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#fff",
    marginTop: 91,
  },
  imageLabel: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "600",
  },
  bottomArea: {
    gap: 28,
    marginTop: 85,
  },
});
