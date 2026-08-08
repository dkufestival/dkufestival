import { Entypo, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest, toDateKey } from '../lib/api';

export default function ScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const readOnly = params.readonly === '1';

  // 1. 현재 날짜를 관리하는 상태 추가 (기본값: 오늘)
  const [currentDate, setCurrentDate] = useState(new Date());
  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 2. 날짜를 변경하는 함수
  const changeDate = (days) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + days);
    setCurrentDate(newDate);
  };

  // 3. 날짜를 "5/7(목)" 형식으로 예쁘게 변환하는 함수
  const formatDate = (date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const week = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${month}/${day}(${week})`;
  };

  useEffect(() => {
    const loadSchedules = async () => {
      setLoading(true);
      try {
        const data = await apiRequest(`/schedules?date=${toDateKey(currentDate)}`);
        setScheduleData(data.schedules || []);
      } catch (error) {
        Alert.alert('일정 조회 실패', error.message);
      } finally {
        setLoading(false);
      }
    };

    loadSchedules();
  }, [currentDate]);

  const updateSchedule = (index, field, value) => {
    setScheduleData((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const addSchedule = () => {
    setScheduleData((items) => [...items, { id: `new-${Date.now()}`, time: '', task: '', note: '' }]);
  };

  const removeSchedule = (index) => {
    setScheduleData((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const saveSchedules = async () => {
    setSaving(true);
    try {
      await apiRequest('/schedules', {
        method: 'PUT',
        body: JSON.stringify({
          date: toDateKey(currentDate),
          schedules: scheduleData,
        }),
      });
      Alert.alert('저장 완료', '일정이 저장되었습니다.');
    } catch (error) {
      Alert.alert('일정 저장 실패', error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <TouchableOpacity
        style={styles.header}
        onPress={() => !readOnly && router.push('/NotificationScreen')}
        disabled={readOnly}
      >
        <Ionicons name="notifications-outline" size={28} color="white" />
      </TouchableOpacity>

      <Text style={styles.logoText}>Playce</Text>

      {/* 날짜 선택바 - 기능 연결 */}
      <View style={styles.dateBar}>
        {/* 왼쪽 화살표: 하루 빼기 */}
        <TouchableOpacity onPress={() => changeDate(-1)}>
          <Entypo name="chevron-left" size={30} color="white" />
        </TouchableOpacity>

        <Text style={styles.dateText}>{formatDate(currentDate)}</Text>

        {/* 오른쪽 화살표: 하루 더하기 */}
        <TouchableOpacity onPress={() => changeDate(1)}>
          <Entypo name="chevron-right" size={30} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.tableContainer}>
        <ScrollView>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 1 }]}>시간</Text>
            <Text style={[styles.headerCell, { flex: 2.5 }]}>일정</Text>
            <Text style={[styles.headerCell, { flex: 1.5 }]}>비고</Text>
            {!readOnly && <Text style={[styles.headerCell, { flex: 0.8 }]}>삭제</Text>}
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#000" />
            </View>
          ) : scheduleData.length === 0 ? (
            <View style={styles.loadingRow}>
              <Text style={styles.emptyText}>등록된 일정이 없습니다.</Text>
            </View>
          ) : scheduleData.map((item, index) => {
            if (item.hide) return null;
            return (
              <View key={index} style={styles.tableRow}>
                <View style={[styles.cell, { flex: 1 }]}>
                  {readOnly ? (
                    <Text style={styles.cellText}>{item.time}</Text>
                  ) : (
                    <TextInput
                      style={styles.inputCell}
                      value={item.time}
                      onChangeText={(value) => updateSchedule(index, 'time', value)}
                      placeholder="09:00"
                      placeholderTextColor="#999"
                    />
                  )}
                </View>
                <View style={[styles.cell, { flex: 2.5, height: item.merge ? item.merge * 45 : 45 }]}>
                  {readOnly ? (
                    <Text style={styles.cellText}>{item.task}</Text>
                  ) : (
                    <TextInput
                      style={styles.inputCell}
                      value={item.task}
                      onChangeText={(value) => updateSchedule(index, 'task', value)}
                      placeholder="일정"
                      placeholderTextColor="#999"
                    />
                  )}
                </View>
                <View style={[styles.cell, { flex: 1.5 }]}>
                  {readOnly ? (
                    <Text style={styles.cellText}>{item.note}</Text>
                  ) : (
                    <TextInput
                      style={styles.inputCell}
                      value={item.note}
                      onChangeText={(value) => updateSchedule(index, 'note', value)}
                      placeholder="비고"
                      placeholderTextColor="#999"
                    />
                  )}
                </View>
                {!readOnly && (
                  <TouchableOpacity style={[styles.cell, styles.deleteCell]} onPress={() => removeSchedule(index)}>
                    <Text style={styles.deleteText}>삭제</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        {!readOnly && (
          <View style={styles.editButtons}>
            <TouchableOpacity style={styles.smallButton} onPress={addSchedule}>
              <Text style={styles.backButtonText}>일정 추가</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallButton, saving ? styles.disabledButton : null]} onPress={saveSchedules} disabled={saving}>
              <Text style={styles.backButtonText}>{saving ? '저장중' : '저장'}</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>뒤로가기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// 스타일은 이전과 동일 (생략 가능)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center' },
  header: { width: '90%', alignItems: 'flex-end', marginTop: 10 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: 'white', marginTop: 10 },
  dateBar: { flexDirection: 'row', alignItems: 'center', marginVertical: 15 },
  dateText: { color: 'white', fontSize: 22, fontWeight: 'bold', marginHorizontal: 20 }, // 폰트 키움
  tableContainer: { backgroundColor: 'white', width: '90%', height: '55%', borderRadius: 15, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#eee', borderBottomWidth: 1, borderColor: '#ccc' },
  headerCell: { padding: 10, textAlign: 'center', fontWeight: 'bold', borderRightWidth: 1, borderColor: '#ccc' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#ccc' },
  cell: { minHeight: 45, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: '#ccc' },
  cellText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  inputCell: { width: '100%', minHeight: 45, paddingHorizontal: 6, textAlign: 'center', color: '#000', fontSize: 13 },
  deleteCell: { flex: 0.8 },
  deleteText: { color: '#c00', fontSize: 12, fontWeight: 'bold' },
  loadingRow: { padding: 30, alignItems: 'center' },
  emptyText: { color: '#777', fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  editButtons: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  smallButton: { flex: 1, backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  disabledButton: { opacity: 0.6 },
  backButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  backButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' }
});
