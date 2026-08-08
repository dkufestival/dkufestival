import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function AnonymousEditScreen() {
  const router = useRouter();

  const [topics, setTopics] = useState([{ id: '1', text: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadTopics = async () => {
      try {
        const data = await apiRequest('/recreation/ANONYMOUS');
        const loaded = (data.questions || []).map((item) => ({
          id: String(item.questionId || item.id),
          text: item.prompt,
        }));
        setTopics(loaded.length > 0 ? loaded : [{ id: '1', text: '' }]);
      } catch (error) {
        Alert.alert('불러오기 실패', error.message);
      }
    };

    loadTopics();
  }, []);

  const updateTopic = (id, text) => {
    setTopics(prev => prev.map(t => t.id === id ? { ...t, text } : t));
  };

  const addTopic = () => {
    const newId = `${Date.now()}`;
    setTopics([...topics, { id: newId, text: '' }]);
  };

  const saveTopics = async () => {
    setSaving(true);
    try {
      await apiRequest('/recreation/ANONYMOUS', {
        method: 'PUT',
        body: JSON.stringify({
          questions: topics.map((topic) => ({ prompt: topic.text })),
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
      <TextInput
        style={styles.input}
        placeholder="주제를 입력하세요"
        placeholderTextColor="#ccc"
        value={item.text}
        onChangeText={(text) => updateTopic(item.id, text)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}><Ionicons name="notifications-outline" size={28} color="white" /></View>
      <Text style={styles.logoText}>Playce</Text>

      {/* 탭 디자인 유지 */}
      <View style={styles.tabContainer}>
        <View style={styles.tabInactive}><Text style={styles.tabText}>레크레이션 진행</Text></View>
        <View style={styles.tabActive}><Text style={styles.tabText}>레크레이션 편집</Text></View>
      </View>

      {/* 편집 박스 */}
      <View style={styles.whiteBox}>
        <View style={styles.titleHeader}>
          <Text style={styles.titleHeaderText}>익명한마디</Text>
        </View>

        <FlatList
          data={topics}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListFooterComponent={
            <TouchableOpacity style={styles.addButton} onPress={addTopic}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={saveTopics} disabled={saving}>
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
  listItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  input: { fontSize: 16, fontWeight: 'bold', color: '#000', textAlign: 'center', width: '100%' },
  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 16 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  saveButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  saveButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' }
});
