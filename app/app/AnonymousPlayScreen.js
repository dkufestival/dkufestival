import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { notifyGameEnded, notifyGameStarted } from '../lib/recreationSocket';

export default function AnonymousPlayScreen() {
  const router = useRouter();
  const [topics, setTopics] = useState([]);
  const [answers, setAnswers] = useState([]);

  const loadAnswers = async () => {
    try {
      const data = await apiRequest('/recreation/ANONYMOUS/answers');
      setAnswers(data.answers || []);
    } catch (error) {
      Alert.alert('답안 조회 실패', error.message);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await apiRequest('/recreation/ANONYMOUS/start', { method: 'POST' });
        const data = await apiRequest('/recreation/ANONYMOUS');
        const loaded = data.questions || [];
        setTopics(loaded);
        if (loaded[0]?.questionId) {
          await apiRequest('/recreation/ANONYMOUS/current-question', {
            method: 'POST',
            body: JSON.stringify({ questionId: loaded[0].questionId }),
          });
        }
        try {
          await notifyGameStarted('ANONYMOUS');
        } catch (socketError) {
          Alert.alert('실시간 전환 실패', socketError.message);
        }
        await loadAnswers();
      } catch (error) {
        Alert.alert('진행 실패', error.message);
      }
    };

    load();
    const timer = setInterval(loadAnswers, 2000);
    return () => clearInterval(timer);
  }, []);

  const complete = async () => {
    try {
      await apiRequest('/recreation/ANONYMOUS/complete', { method: 'POST' });
      try {
        await notifyGameEnded();
      } catch (socketError) {
        Alert.alert('실시간 종료 알림 실패', socketError.message);
      }
      router.back();
    } catch (error) {
      Alert.alert('완료 처리 실패', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.logoText}>Playce</Text>
      <Text style={styles.roundText}>익명한마디</Text>

      <View style={styles.card}>
        <Text style={styles.topicText}>{topics[0]?.prompt || '등록된 주제가 없습니다.'}</Text>
        <FlatList
          data={answers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.answerList}
          ListEmptyComponent={<Text style={styles.emptyText}>아직 제출된 한마디가 없습니다.</Text>}
          renderItem={({ item }) => (
            <View style={styles.answerItem}>
              <Text style={styles.answerText}>{item.answerText}</Text>
            </View>
          )}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={loadAnswers}>
          <Text style={styles.buttonText}>새로고침</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={complete}>
          <Text style={styles.buttonText}>완료</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 50 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: '#FFF', marginBottom: 20 },
  roundText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  card: { width: '90%', height: '55%', backgroundColor: '#FFF', borderRadius: 15, padding: 18 },
  topicText: { color: '#000', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 14 },
  answerList: { paddingBottom: 12 },
  answerItem: { backgroundColor: '#EEE', borderRadius: 10, padding: 12, marginBottom: 10 },
  answerText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  emptyText: { color: '#777', textAlign: 'center', marginTop: 60, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 50, width: '90%', gap: 12 },
  primaryButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#DDD', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
