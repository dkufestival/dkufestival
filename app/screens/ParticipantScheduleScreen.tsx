import { StyleSheet, Text, View } from "react-native";

import { PlayceButton, PlayceLayout } from "./participant-ui";

const rows = [
  ["09:00", "", ""],
  ["10:00", "개인정비", ""],
  ["11:00", "", ""],
  ["12:00", "점심", ""],
  ["13:00", "", ""],
  ["14:00", "세미나", ""],
  ["15:00", "", ""],
  ["16:00", "", ""],
  ["17:00", "저녁", ""],
  ["18:00", "", ""],
  ["19:00", "레크레이션", ""],
  ["20:00", "", ""],
  ["21:00", "", ""],
  ["22:00", "", ""],
  ["23:00", "취침", ""],
];

export default function ParticipantScheduleScreen() {
  return (
    <PlayceLayout showExit>
      <View style={styles.dateRow}>
        <Text style={styles.dateText}>{"<"}</Text>
        <Text style={styles.dateText}>5/7(목)</Text>
        <Text style={styles.dateText}>{">"}</Text>
      </View>

      <View style={styles.tableCard}>
        <View style={styles.headerRow}>
          <Text style={[styles.cell, styles.timeCell, styles.headerText]}>시간</Text>
          <Text style={[styles.cell, styles.eventCell, styles.headerText]}>일정</Text>
          <Text style={[styles.cell, styles.noteCell, styles.headerText]}>비고</Text>
        </View>
        {rows.map(([time, event, note]) => (
          <View key={time} style={styles.row}>
            <Text style={[styles.cell, styles.timeCell, styles.timeText]}>{time}</Text>
            <Text style={[styles.cell, styles.eventCell, styles.eventText]}>{event}</Text>
            <Text style={[styles.cell, styles.noteCell]}>{note}</Text>
          </View>
        ))}
      </View>

      <View style={styles.backButton}>
        <PlayceButton label="뒤로가기" />
      </View>
    </PlayceLayout>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 17,
    marginTop: 17,
    paddingRight: 1,
  },
  dateText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  tableCard: {
    height: 466,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#fff",
    marginTop: 13,
  },
  headerRow: {
    flexDirection: "row",
    height: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#999",
  },
  row: {
    flexDirection: "row",
    height: 23,
    borderBottomWidth: 1,
    borderBottomColor: "#bbb",
  },
  cell: {
    color: "#000",
    textAlign: "center",
    textAlignVertical: "center",
  },
  timeCell: {
    width: 67,
    borderRightWidth: 1,
    borderRightColor: "#999",
  },
  eventCell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "#999",
  },
  noteCell: {
    width: 90,
  },
  headerText: {
    fontSize: 14,
    fontWeight: "900",
  },
  timeText: {
    fontSize: 13,
    fontWeight: "900",
  },
  eventText: {
    fontSize: 14,
    fontWeight: "900",
  },
  backButton: {
    marginTop: 24,
  },
});
