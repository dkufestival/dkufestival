import { FontAwesome5, Ionicons } from '@expo/vector-icons'; // 아이콘 라이브러리
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function RPSQuizEditScreen() {
  const router = useRouter();

  const [rounds, setRounds] = useState([{ id: '1', name: 'Round 1', selected: null }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadRounds = async () => {
      try {
        const data = await apiRequest('/recreation/RPS');
        const loaded = (data.questions || []).map((item, index) => ({
          id: String(item.questionId || item.id),
          name: item.prompt || `Round ${index + 1}`,
          selected: item.answer || null,
        }));
        setRounds(loaded.length > 0 ? loaded : [{ id: '1', name: 'Round 1', selected: null }]);
      } catch (error) {
        Alert.alert('불러오기 실패', error.message);
      }
    };

    loadRounds();
  }, []);

  const selectHand = (id, hand) => {
    setRounds(prev => prev.map(r => 
      r.id === id ? { ...r, selected: hand } : r
    ));
  };

  const addRound = () => {
    const newId = `${Date.now()}`;
    setRounds([...rounds, { id: newId, name: `Round ${rounds.length + 1}`, selected: null }]);
  };

  const saveRounds = async () => {
    setSaving(true);
    try {
      await apiRequest('/recreation/RPS', {
        method: 'PUT',
        body: JSON.stringify({
          questions: rounds.map((item, index) => ({
            prompt: `Round ${index + 1}`,
            answer: item.selected,
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
      <Text style={styles.listText}>{item.name}</Text>
      
      {/* 주먹, 가위, 보 선택 영역 */}
      <View style={styles.rpsContainer}>
        {/* 주먹 (rock) */}
        <TouchableOpacity 
          style={[styles.rpsButton, item.selected === 'rock' ? styles.activeBtn : styles.inactiveBtn]}
          onPress={() => selectHand(item.id, 'rock')}
        >
          <FontAwesome5 name="fist-raised" size={20} color="black" />
        </TouchableOpacity>
        
        {/* 가위 (scissors) */}
        <TouchableOpacity 
          style={[styles.rpsButton, item.selected === 'scissors' ? styles.activeBtn : styles.inactiveBtn, styles.borderLeft]}
          onPress={() => selectHand(item.id, 'scissors')}
        >
          <FontAwesome5 name="hand-scissors" size={20} color="black" />
        </TouchableOpacity>

        {/* 보 (paper) */}
        <TouchableOpacity 
          style={[styles.rpsButton, item.selected === 'paper' ? styles.activeBtn : styles.inactiveBtn, styles.borderLeft]}
          onPress={() => selectHand(item.id, 'paper')}
        >
          <FontAwesome5 name="hand-paper" size={20} color="black" />
        </TouchableOpacity>
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
        <View style={styles.titleHeader}><Text style={styles.titleHeaderText}>가위바위보</Text></View>
        <FlatList
          data={rounds}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListFooterComponent={
            <TouchableOpacity style={styles.addButton} onPress={addRound}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={saveRounds} disabled={saving}>
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
  listText: { flex: 1, fontSize: 16, fontWeight: 'bold' },
  
  // 가위바위보 버튼 스타일
  rpsContainer: { flexDirection: 'row', borderWidth: 1, borderColor: '#333', borderRadius: 8, overflow: 'hidden' },
  rpsButton: { width: 45, height: 40, justifyContent: 'center', alignItems: 'center' },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: '#333' },
  activeBtn: { backgroundColor: '#999' }, // 선택 시 회색 배경 (이미지 반영)
  inactiveBtn: { backgroundColor: '#fff' },

  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 16 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  saveButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  saveButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' }
});
