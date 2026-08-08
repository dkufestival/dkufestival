import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function WordQuizEditScreen() {
  const router = useRouter();

  const [quizSets, setQuizSets] = useState([{ id: '1', answer: '', word1: '', word2: '', word3: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSets = async () => {
      try {
        const data = await apiRequest('/recreation/WORD');
        const loaded = (data.questions || []).map((item) => ({
          id: String(item.questionId || item.id),
          answer: item.answer,
          word1: item.option1,
          word2: item.option2,
          word3: item.option3,
        }));
        setQuizSets(loaded.length > 0 ? loaded : [{ id: '1', answer: '', word1: '', word2: '', word3: '' }]);
      } catch (error) {
        Alert.alert('불러오기 실패', error.message);
      }
    };

    loadSets();
  }, []);

  const updateQuiz = (id, field, value) => {
    setQuizSets(prev => prev.map(set => 
      set.id === id ? { ...set, [field]: value } : set
    ));
  };

  const addSet = () => {
    const newId = `${Date.now()}`;
    setQuizSets([...quizSets, { id: newId, answer: '', word1: '', word2: '', word3: '' }]);
  };

  const saveSets = async () => {
    setSaving(true);
    try {
      const requestBody = {
        questions: quizSets.map((item) => ({
          answer: item.answer,
          option1: item.word1,
          option2: item.word2,
          option3: item.word3,
        })),
      };
      console.log('[RecreationSave] request body:', requestBody);
      const result = await apiRequest('/recreation/WORD', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      console.log('[RecreationSave] response:', result);
      router.back();
    } catch (error) {
      Alert.alert('저장 실패', error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.quizGroup}>
      {/* 정답 입력 */}
      <View style={styles.inputRow}>
        <Text style={styles.label}>정답</Text>
        <TextInput 
          style={styles.input} 
          placeholder="정답을 입력하세요" 
          value={item.answer}
          onChangeText={(v) => updateQuiz(item.id, 'answer', v)}
        />
      </View>
      {/* 제시어 1 입력 */}
      <View style={styles.inputRow}>
        <Text style={styles.label}>제시어 1</Text>
        <TextInput 
          style={styles.input} 
          placeholder="첫번째 제시어를 입력하세요" 
          value={item.word1}
          onChangeText={(v) => updateQuiz(item.id, 'word1', v)}
        />
      </View>
      {/* 제시어 2 입력 */}
      <View style={styles.inputRow}>
        <Text style={styles.label}>제시어 2</Text>
        <TextInput 
          style={styles.input} 
          placeholder="두번째 제시어를 입력하세요" 
          value={item.word2}
          onChangeText={(v) => updateQuiz(item.id, 'word2', v)}
        />
      </View>
      {/* 제시어 3 입력 */}
      <View style={styles.inputRow}>
        <Text style={styles.label}>제시어 3</Text>
        <TextInput 
          style={styles.input} 
          placeholder="세번째 제시어를 입력하세요" 
          value={item.word3}
          onChangeText={(v) => updateQuiz(item.id, 'word3', v)}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}><Ionicons name="notifications-outline" size={28} color="white" /></View>
      <Text style={styles.logoText}>Playce</Text>

      {/* 탭 (UI 유지용) */}
      <View style={styles.tabContainer}>
        <View style={styles.tabInactive}><Text style={styles.tabText}>레크레이션 진행</Text></View>
        <View style={styles.tabActive}><Text style={styles.tabText}>레크레이션 편집</Text></View>
      </View>

      {/* 편집 박스 */}
      <View style={styles.whiteBox}>
        <View style={styles.titleHeader}><Text style={styles.titleHeaderText}>제시어게임</Text></View>
        
        <FlatList
          data={quizSets}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
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
  
  // 입력 그룹 스타일
  quizGroup: { padding: 10, borderBottomWidth: 5, borderBottomColor: '#f9f9f9' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  label: { width: 80, fontSize: 14, fontWeight: 'bold', color: '#000' },
  input: { flex: 1, fontSize: 14, color: '#000' },

  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 16 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  saveButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  saveButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' }
});
