import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function BalanceEditScreen() {
  const router = useRouter();
  const [mode, setMode] = useState('edit'); 
  const [questions, setQuestions] = useState([{ id: '1', prompt: '', option1: '', option2: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await apiRequest('/recreation/BALANCE');
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions.map(q => ({
            id: String(q.questionId || q.id),
            questionId: q.questionId,
            prompt: q.prompt || '',
            option1: q.option1 || '',
            option2: q.option2 || '',
          })));
        }
      } catch (error) { Alert.alert('불러오기 실패', error.message); }
    };
    loadData();
  }, []);

  const updateQuestion = (id, field, value) => setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  const addQuestion = () => setQuestions([...questions, { id: `${Date.now()}`, prompt: '', option1: '', option2: '' }]);

  const saveOptions = async () => {
    const validQuestions = questions
      .map((question) => ({
        ...question,
        prompt: String(question.prompt || '').trim(),
        option1: String(question.option1 || '').trim(),
        option2: String(question.option2 || '').trim(),
      }))
      .filter((question) => question.prompt || question.option1 || question.option2);

    if (validQuestions.some((question) => !question.prompt || !question.option1 || !question.option2)) {
      Alert.alert('알림', '질문과 두 선택지를 모두 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const requestBody = { questions: validQuestions };
      console.log('[RecreationSave] request body:', requestBody);
      const result = await apiRequest('/recreation/BALANCE', { method: 'PUT', body: JSON.stringify(requestBody) });
      console.log('[RecreationSave] response:', result);
      setQuestions(validQuestions.length > 0 ? validQuestions : [{ id: '1', prompt: '', option1: '', option2: '' }]);
      router.back();
    } catch (error) { Alert.alert('저장 실패', error.message); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}><Ionicons name="notifications-outline" size={28} color="white" /></View>
      <Text style={styles.logoText}>Playce</Text>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={mode === 'play' ? styles.tabActive : styles.tabInactive} onPress={() => setMode('play')}>
          <Text style={styles.tabText}>레크레이션 진행</Text>
        </TouchableOpacity>
        <TouchableOpacity style={mode === 'edit' ? styles.tabActive : styles.tabInactive} onPress={() => setMode('edit')}>
          <Text style={styles.tabText}>레크레이션 편집</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.whiteBox}>
        <View style={styles.titleHeader}><Text style={styles.titleHeaderText}>밸런스 게임</Text></View>
        
        {mode === 'edit' ? (
          <FlatList
            data={questions}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <View style={{ flex: 1 }}>
                  <TextInput style={styles.input} placeholder="질문 내용" value={item.prompt} onChangeText={(val) => updateQuestion(item.id, 'prompt', val)} />
                  <TextInput style={styles.input} placeholder="선택지 1" value={item.option1} onChangeText={(val) => updateQuestion(item.id, 'option1', val)} />
                  <TextInput style={styles.input} placeholder="선택지 2" value={item.option2} onChangeText={(val) => updateQuestion(item.id, 'option2', val)} />
                </View>
              </View>
            )}
            ListFooterComponent={<TouchableOpacity style={styles.addButton} onPress={addQuestion}><Text style={styles.addButtonText}>+ 추가</Text></TouchableOpacity>}
          />
        ) : (
          <View style={styles.playPreview}>
            <Text style={styles.playPreviewText}>저장한 뒤 진행 화면에서 시작해주세요.</Text>
            <TouchableOpacity style={styles.previewButton} onPress={() => router.push('/BalancePlayScreen')}>
              <Text style={styles.previewButtonText}>진행 화면 열기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {mode === 'edit' && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveButton} onPress={saveOptions} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '저장'}</Text>
          </TouchableOpacity>
        </View>
      )}
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
  whiteBox: { backgroundColor: 'white', width: '90%', height: '50%', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, overflow: 'hidden' },
  titleHeader: { padding: 12, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  titleHeaderText: { fontWeight: 'bold', fontSize: 16 },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  input: { fontSize: 15, fontWeight: 'bold', color: '#000', marginBottom: 5 },
  playPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 14 },
  playPreviewText: { color: '#000', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  previewButton: { backgroundColor: '#000', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 18 },
  previewButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 16 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  saveButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  saveButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
});
