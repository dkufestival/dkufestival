import { StyleSheet, View } from "react-native";

import { PlayceButton, PlayceHeading, PlayceInput, PlayceLayout } from "./participant-ui";

export default function ParticipantWordGuessScreen() {
  return (
    <PlayceLayout>
      <PlayceHeading>Round 1</PlayceHeading>

      <View style={styles.promptGroup}>
        <PlayceButton label="제시어 1" muted />
        <PlayceButton label="제시어 2" muted />
        <PlayceButton label="제시어 3" muted />
      </View>

      <View style={styles.bottomArea}>
        <PlayceInput placeholder="답안을 작성하세요" />
        <PlayceButton label="제출" />
      </View>
    </PlayceLayout>
  );
}

const styles = StyleSheet.create({
  promptGroup: {
    gap: 26,
    marginTop: 59,
  },
  bottomArea: {
    gap: 28,
    marginTop: "auto",
    paddingBottom: 91,
  },
});
