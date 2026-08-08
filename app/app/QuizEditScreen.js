import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function QuizEditScreen() {
  const router = useRouter();

  const [questions, setQuestions] = useState([{ id: '1', text: '', answer: null }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const data = await apiRequest('/recreation/OX');
        const loaded = (data.questions || []).map((item) => ({
          id: String(item.questionId || item.id),
          text: item.prompt,
          answer: item.answer || null,
        }));
        setQuestions(loaded.length > 0 ? loaded : [{ id: '1', text: '', answer: null }]);
      } catch (error) {
        Alert.alert('불러오기 실패', error.message);
      }
    };

    loadQuestions();
  }, []);

  // O 또는 X를 클릭했을 때 정답을 변경하는 함수
  const toggleAnswer = (id, newAnswer) => {
    setQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, answer: newAnswer } : q
    ));
  };

  // 질문 텍스트를 수정하는 함수
  const updateQuestionText = (id, text) => {
    setQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, text: text } : q
    ));
  };

  // 새로운 질문 추가 함수
  const addQuestion = () => {
    const newId = `${Date.now()}`;
    setQuestions([...questions, { id: newId, text: '', answer: null }]);
  };

  const saveQuestions = async () => {
    setSaving(true);
    try {
      await apiRequest('/recreation/OX', {
        method: 'PUT',
        body: JSON.stringify({
          questions: questions.map((item) => ({
            prompt: item.text,
            answer: item.answer,
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

  const renderItem = ({ item }) => (
    <View style={styles.listItem}>
      {/* 질문 입력창 */}
      <TextInput
        style={styles.input}
        placeholder="질문을 작성하세요"
        placeholderTextColor="#ccc"
        value={item.text}
        onChangeText={(text) => updateQuestionText(item.id, text)}
      />

      {/* O/X 선택 영역 */}
      <View style={styles.oxContainer}>
        {/* O 버튼 */}
        <TouchableOpacity 
          style={[styles.oxButton, item.answer === 'O' ? styles.activeO : styles.inactiveBtn]}
          onPress={() => toggleAnswer(item.id, 'O')}
        >
          <Text style={[styles.oxText, item.answer === 'O' ? styles.activeText : styles.inactiveText]}>O</Text>
        </TouchableOpacity>
        
        {/* X 버튼 */}
        <TouchableOpacity 
          style={[styles.oxButton, item.answer === 'X' ? styles.activeX : styles.inactiveBtn]}
          onPress={() => toggleAnswer(item.id, 'X')}
        >
          <Text style={[styles.oxText, item.answer === 'X' ? styles.activeText : styles.inactiveText]}>X</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <Ionicons name="notifications-outline" size={28} color="white" />
      </View>

      <Text style={styles.logoText}>Playce</Text>

      {/* 상단 탭 (이미지 유지용) */}
      <View style={styles.tabContainer}>
        <View style={styles.tabInactive}><Text style={styles.tabText}>레크레이션 진행</Text></View>
        <View style={styles.tabActive}><Text style={styles.tabText}>레크레이션 편집</Text></View>
      </View>

      {/* 편집 박스 */}
      <View style={styles.whiteBox}>
        <View style={styles.titleHeader}>
          <Text style={styles.titleHeaderText}>O/X 퀴즈</Text>
        </View>

        <FlatList
          data={questions}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListFooterComponent={
            <TouchableOpacity style={styles.addButton} onPress={addQuestion}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* 하단 저장 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={saveQuestions} disabled={saving}>
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

  whiteBox: { backgroundColor: 'white', width: '90%', height: '50%', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, overflow: 'hidden' },
  titleHeader: { padding: 12, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  titleHeaderText: { fontWeight: 'bold', fontSize: 16 },

  listItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  input: { flex: 1, fontSize: 15, fontWeight: 'bold', color: '#000' },

  oxContainer: { flexDirection: 'row', borderWidth: 1, borderColor: '#333', borderRadius: 8, overflow: 'hidden' },
  oxButton: { width: 45, height: 40, justifyContent: 'center', alignItems: 'center' },
  oxText: { fontSize: 24, fontWeight: 'bold' },
  
  // O/X 상태별 스타일
  activeO: { backgroundColor: '#999' }, // 선택된 O (이미지 기준 회색조)
  activeX: { backgroundColor: '#999' }, // 선택된 X
  inactiveBtn: { backgroundColor: '#fff' },
  activeText: { color: '#000' },
  inactiveText: { color: '#000' },

  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 16 },

  footer: { position: 'absolute', bottom: 50, width: '90%' },
  saveButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  saveButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' }
});
