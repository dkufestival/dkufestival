import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { normalizeRoomCode, socket } from '@/socket';

export default function HostGameScreen({
  title,
  stagePrefix = 'Question',
  primaryLabel = '다음 문제',
  secondaryLabel = '결과 보기',
}) {
  const router = useRouter();
  const { roomCode } = useLocalSearchParams();
  const [stageIndex, setStageIndex] = useState(1);
  const [ending, setEnding] = useState(false);

  const handleEndGame = () => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!normalizedRoomCode) {
      Alert.alert('게임 종료 실패', '방 번호를 찾을 수 없습니다.');
      return;
    }

    if (ending) {
      return;
    }

    setEnding(true);

    if (!socket.connected) {
      socket.connect();
    }

    socket.timeout(5000).emit(
      'endGame',
      { roomCode: normalizedRoomCode },
      (error, response) => {
        setEnding(false);

        if (error || !response?.ok) {
          Alert.alert('게임 종료 실패', response?.message || '서버 연결을 확인해주세요.');
          return;
        }

        router.back();
      },
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity>
          <Ionicons name="notifications-outline" size={28} color="white" />
        </TouchableOpacity>
      </View>

      <Text style={styles.logoText}>Playce</Text>

      <View style={styles.panel}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.stage}>{stagePrefix} {stageIndex}</Text>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>진행 중</Text>
          <Text style={styles.statusText}>참가자 화면이 게임 화면으로 전환되었습니다.</Text>
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setStageIndex((current) => current + 1)}
          >
            <Text style={styles.actionButtonText}>{primaryLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{secondaryLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.endButton, ending && styles.disabledButton]}
            onPress={handleEndGame}
            disabled={ending}
          >
            <Text style={styles.endButtonText}>게임 종료</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>뒤로가기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center' },
  header: { width: '90%', alignItems: 'flex-end', marginTop: 10 },
  logoText: { fontSize: 45, fontWeight: 'bold', color: 'white', marginTop: 10, marginBottom: 30 },
  panel: {
    width: '90%',
    minHeight: '48%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 22,
  },
  title: { color: '#000', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  stage: { color: '#000', fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 18 },
  statusBox: {
    marginTop: 36,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 18,
    alignItems: 'center',
  },
  statusLabel: { color: '#000', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  statusText: { color: '#555', fontSize: 14, textAlign: 'center' },
  buttonGroup: { gap: 14, marginTop: 34 },
  actionButton: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  endButton: { backgroundColor: '#d93025' },
  disabledButton: { opacity: 0.6 },
  endButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  backButton: { backgroundColor: 'white', padding: 16, borderRadius: 30, alignItems: 'center' },
  backButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
});
