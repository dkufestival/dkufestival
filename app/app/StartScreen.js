import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest, setActiveRoomId, setCurrentMember, setCurrentUser } from '../lib/api';

export default function StartScreen() {
  const router = useRouter();

  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [organization, setOrganization] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);

  const handleLogin = async () => {
    if (!id.trim() || !password.trim()) {
      Alert.alert('알림', '아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ id: id.trim(), password }),
      });

      setCurrentUser(data.user);
      router.replace('/AdminMainScreen');
    } catch (error) {
      Alert.alert('로그인 실패', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      Alert.alert('알림', '방 코드를 입력해주세요.');
      return;
    }
    if (!participantName.trim() || !organization.trim() || !studentNumber.trim()) {
      Alert.alert('알림', '이름, 소속, 학번을 모두 입력해주세요.');
      return;
    }

    setJoining(true);
    try {
      const data = await apiRequest('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({
          roomCode: roomCode.trim(),
          nickname: participantName.trim(),
          organization: organization.trim(),
          studentNumber: studentNumber.trim(),
        }),
      });

      setActiveRoomId(data.room?.room_id || data.room?.roomId);
      setCurrentMember(data.member);
      router.push('/ParticipantHomeScreen');
    } catch (error) {
      Alert.alert('참가 실패', error.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.innerContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.wrapper}>
            <Text style={styles.title}>Playce</Text>

            <View style={styles.inputSection}>
              <Text style={styles.label}>ID</Text>
              <TextInput
                style={styles.input}
                placeholder="ID를 입력하세요"
                placeholderTextColor="#888"
                value={id}
                onChangeText={setId}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Password를 입력하세요"
                placeholderTextColor="#888"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <TouchableOpacity
                style={[styles.button, loading ? styles.buttonDisabled : null]}
                onPress={handleLogin}
                activeOpacity={0.7}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>로그인</Text>}
              </TouchableOpacity>
            </View>

            <View style={[styles.inputSection, { marginTop: 25 }]}>
              <Text style={styles.label}>방 코드입력</Text>
              <TextInput
                style={styles.input}
                placeholder="ABCD"
                placeholderTextColor="#888"
                value={roomCode}
                onChangeText={setRoomCode}
                autoCapitalize="characters"
                maxLength={6}
              />

              <Text style={styles.label}>이름</Text>
              <TextInput
                style={styles.input}
                placeholder="이름을 입력하세요"
                placeholderTextColor="#888"
                value={participantName}
                onChangeText={setParticipantName}
              />

              <Text style={styles.label}>소속</Text>
              <TextInput
                style={styles.input}
                placeholder="소속을 입력하세요"
                placeholderTextColor="#888"
                value={organization}
                onChangeText={setOrganization}
              />

              <Text style={styles.label}>학번</Text>
              <TextInput
                style={styles.input}
                placeholder="학번을 입력하세요"
                placeholderTextColor="#888"
                value={studentNumber}
                onChangeText={setStudentNumber}
                keyboardType="number-pad"
              />

              <TouchableOpacity
                style={[styles.button, joining ? styles.buttonDisabled : null]}
                activeOpacity={0.7}
                onPress={handleJoinRoom}
                disabled={joining}
              >
                {joining ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>비회원 참가</Text>}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/RegisterScreen')}
              style={styles.linkContainer}
            >
              <Text style={styles.linkText}>회원가입</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  innerContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  wrapper: { width: 320 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#FFF', textAlign: 'center', marginBottom: 40, textDecorationLine: 'underline' },
  inputSection: { width: '100%' },
  label: { color: '#FFF', fontSize: 12, marginBottom: 5, marginLeft: 2 },
  input: { width: '100%', height: 48, backgroundColor: '#DDD', borderRadius: 10, paddingHorizontal: 15, marginBottom: 15, fontSize: 14, color: '#000' },
  button: { width: '100%', height: 48, backgroundColor: '#DDD', borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontWeight: 'bold', color: '#000', fontSize: 16 },
  linkContainer: { marginTop: 30, alignItems: 'center' },
  linkText: { color: '#FFF', fontSize: 14, textDecorationLine: 'underline' },
});
