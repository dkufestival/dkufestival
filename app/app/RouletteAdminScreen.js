import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function RouletteAdminScreen() {
  const router = useRouter();
  const [options, setOptions] = useState([{ id: '1', text: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const data = await apiRequest('/recreation/ROULETTE');
        const loaded = (data.questions || []).map((item) => ({
          id: String(item.questionId || item.id),
          text: item.prompt,
        }));
        setOptions(loaded.length > 0 ? loaded : [{ id: '1', text: '' }]);
      } catch (error) {
        Alert.alert('불러오기 실패', error.message);
      }
    };

    loadOptions();
  }, []);

  const updateOption = (id, text) => {
    setOptions(prev => prev.map(option => option.id === id ? { ...option, text } : option));
  };

  const addOption = () => {
    setOptions([...options, { id: `${Date.now()}`, text: '' }]);
  };

  const saveOptions = async () => {
    setSaving(true);
    try {
      const requestBody = {
        questions: options.map((option) => ({ prompt: option.text })),
      };
      console.log('[RecreationSave] request body:', requestBody);
      const result = await apiRequest('/recreation/ROULETTE', {
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

  const renderItem = ({ item, index }) => (
    <View style={styles.listItem}>
      <Text style={styles.optionLabel}>옵션 {index + 1}</Text>
      <TextInput
        style={styles.input}
        placeholder="룰렛 옵션을 입력하세요"
        placeholderTextColor="#ccc"
        value={item.text}
        onChangeText={(text) => updateOption(item.id, text)}
      />
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
        <View style={styles.titleHeader}><Text style={styles.titleHeaderText}>룰렛</Text></View>
        <FlatList
          data={options}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListFooterComponent={
            <TouchableOpacity style={styles.addButton} onPress={addOption}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={saveOptions} disabled={saving}>
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
  optionLabel: { width: 70, fontSize: 14, fontWeight: 'bold', color: '#000' },
  input: { flex: 1, fontSize: 15, fontWeight: 'bold', color: '#000' },
  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 16 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  saveButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  saveButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
});
