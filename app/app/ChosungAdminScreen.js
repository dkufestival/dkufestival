import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function ChosungAdminScreen() {
  const router = useRouter();
  const [quizSets, setQuizSets] = useState([{ id: '1', prompt: '', answer: '', topic: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSets = async () => {
      try {
        const data = await apiRequest('/recreation/CHOSUNG');
        const loaded = (data.questions || []).map((item) => ({
          id: String(item.questionId || item.id),
          questionId: item.questionId,
          prompt: item.prompt || '',
          answer: item.answer || '',
          topic: item.option1 || '',
        }));
        setQuizSets(loaded.length > 0 ? loaded : [{ id: '1', prompt: '', answer: '', topic: '' }]);
      } catch (error) {
        Alert.alert('불러오기 실패', error.message);
      }
    };

    loadSets();
  }, []);

  const updateQuiz = (id, field, value) => {
    setQuizSets((current) => current.map((quiz) => quiz.id === id ? { ...quiz, [field]: value } : quiz));
  };

  const addSet = () => {
    setQuizSets((current) => [...current, { id: `${Date.now()}`, prompt: '', answer: '', topic: '' }]);
  };

  const saveSets = async () => {
    const questions = quizSets
      .map((quiz) => ({
        ...quiz,
        prompt: String(quiz.prompt || '').trim(),
        answer: String(quiz.answer || '').trim(),
        topic: String(quiz.topic || '').trim(),
      }))
      .filter((quiz) => quiz.prompt || quiz.answer || quiz.topic);

    if (questions.some((quiz) => !quiz.prompt || !quiz.answer)) {
      Alert.alert('알림', '초성과 정답을 모두 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/recreation/CHOSUNG', {
        method: 'PUT',
        body: JSON.stringify({
          questions: questions.map((quiz) => ({
            prompt: quiz.prompt,
            answer: quiz.answer,
            option1: quiz.topic,
          })),
        }),
      });
      router.back();
    } catch (error) {
      Alert.alert('저장 실패', error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item, index }) => (
    <View style={styles.quizGroup}>
      <Text style={styles.groupTitle}>문제 {index + 1}</Text>
      <View style={styles.inputRow}>
        <Text style={styles.label}>주제</Text>
        <TextInput
          style={styles.input}
          placeholder="예: 영화, 음식, 인물"
          value={item.topic}
          onChangeText={(value) => updateQuiz(item.id, 'topic', value)}
        />
      </View>
      <View style={styles.inputRow}>
        <Text style={styles.label}>초성</Text>
        <TextInput
          style={styles.input}
          placeholder="예: ㅎㄱㄷ"
          value={item.prompt}
          onChangeText={(value) => updateQuiz(item.id, 'prompt', value)}
        />
      </View>
      <View style={styles.inputRow}>
        <Text style={styles.label}>정답</Text>
        <TextInput
          style={styles.input}
          placeholder="정답을 입력하세요"
          value={item.answer}
          onChangeText={(value) => updateQuiz(item.id, 'answer', value)}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}><Ionicons name="notifications-outline" size={28} color="white" /></View>
      <Text style={styles.logoText}>Playce</Text>

      <View style={styles.tabContainer}>
        <View style={styles.tabInactive}><Text style={styles.tabText}>레크레이션 진행</Text></View>
        <View style={styles.tabActive}><Text style={styles.tabText}>레크레이션 편집</Text></View>
      </View>

      <View style={styles.whiteBox}>
        <View style={styles.titleHeader}><Text style={styles.titleHeaderText}>초성 퀴즈</Text></View>
        <FlatList
          data={quizSets}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            <TouchableOpacity style={styles.addButton} onPress={addSet}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={saveSets} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '저장'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center' },
  header: { width: '90%', alignItems: 'flex-end', marginTop: 10 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: 'white', marginBottom: 20 },
  tabContainer: { flexDirection: 'row', width: '90%' },
  tabActive: { flex: 1, height: 45, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabInactive: { flex: 1, height: 45, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabText: { fontWeight: 'bold' },
  whiteBox: { backgroundColor: 'white', width: '90%', height: '55%', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, overflow: 'hidden' },
  titleHeader: { padding: 12, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  titleHeaderText: { fontWeight: 'bold', fontSize: 16 },
  listContent: { paddingBottom: 20 },
  quizGroup: { padding: 10, borderBottomWidth: 5, borderBottomColor: '#f9f9f9' },
  groupTitle: { color: '#000', fontSize: 13, fontWeight: '900', marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  label: { width: 80, fontSize: 14, fontWeight: 'bold', color: '#000' },
  input: { flex: 1, fontSize: 14, color: '#000' },
  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 16 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  saveButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  saveButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
});
