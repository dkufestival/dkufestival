import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function AttendanceScreen() {
  const router = useRouter();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAttendance = async (showLoading = false) => {
      if (showLoading) {
        setLoading(true);
      }
      try {
        const data = await apiRequest('/attendance');
        if (mounted) {
          setStudents(data.members || []);
        }
      } catch (error) {
        if (mounted) {
          Alert.alert('인원 조회 실패', error.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadAttendance(true);
    const timer = setInterval(() => loadAttendance(false), 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.logoText}>Playce</Text>

      {/* 흰색 카드 영역 */}
      <View style={styles.card}>
        <ScrollView>
          {/* 헤더 */}
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.headerText, { flex: 1 }]}>이름</Text>
            <Text style={[styles.cell, styles.headerText, { flex: 2 }]}>소속</Text>
            <Text style={[styles.cell, styles.headerText, { flex: 1.5 }]}>학번</Text>
            <Text style={[styles.cell, styles.headerText, { flex: 2 }]}>비고</Text>
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#000" />
            </View>
          ) : students.length === 0 ? (
            <View style={styles.loadingRow}>
              <Text style={styles.emptyText}>참가자가 없습니다.</Text>
            </View>
          ) : students.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={[styles.cell, { flex: 1 }]}>{item.name}</Text>
              <Text style={[styles.cell, { flex: 2 }]}>{item.school}</Text>
              <Text style={[styles.cell, { flex: 1.5, fontWeight: 'bold' }]}>{item.num}</Text>
              <Text style={[styles.cell, { flex: 2, fontSize: 12 }]}>{item.note}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* 하단 뒤로가기 버튼 */}
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => router.back()} // 이전 화면(진행자 메인)으로 돌아가기
      >
        <Text style={styles.backButtonText}>뒤로가기</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    paddingTop: 50,
  },
  logoText: {
    fontSize: 50,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 30,
  },
  card: {
    width: '90%',
    height: '60%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden', // 테두리 밖으로 내용 안나가게
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerRow: {
    backgroundColor: '#F8F8F8',
    borderBottomWidth: 2,
    borderBottomColor: '#DDD',
  },
  cell: {
    textAlign: 'center',
    fontSize: 14,
    color: '#000',
  },
  headerText: {
    fontWeight: 'bold',
  },
  loadingRow: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: '#777',
    fontWeight: 'bold',
  },
  backButton: {
    width: '90%',
    height: 55,
    backgroundColor: '#FFF',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 50,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
});
