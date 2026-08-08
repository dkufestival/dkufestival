import { useRouter } from 'expo-router';
import { useState } from 'react'; // 1. useState 추가
import { Alert, ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function RegisterScreen() {
  const router = useRouter();

  // 2. 입력 데이터를 저장할 보관함 생성
  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    id: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);

  // 3. 입력창의 텍스트가 바뀔 때 데이터를 업데이트하는 함수
  const handleChange = (name, value) => {
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSignUp = async () => {
    const { lastName, firstName, id, password, confirmPassword } = formData;
    const nickname = `${lastName}${firstName}`.trim();

    if (!nickname || !id || !password || !confirmPassword) {
      Alert.alert('알림', '모든 필드를 입력해주세요!');
      return;
    }

    if (id.length < 4) {
      Alert.alert('알림', 'ID는 4글자 이상이어야 합니다.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('알림', '비밀번호가 일치하지 않습니다!');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/register', {
        method: 'POST',
        body: JSON.stringify({ nickname, id: id.trim(), password, confirmPassword }),
      });

      Alert.alert('회원가입 완료', '가입이 완료되었습니다. 로그인 후 이용해주세요.');
      router.replace('/StartScreen');
    } catch (error) {
      Alert.alert('회원가입 실패', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.innerContainer}>
        <Text style={styles.logo}>Playce</Text>

        <View style={styles.formWrapper}>
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>성</Text>
              <TextInput 
                style={styles.input} 
                placeholder="홍" 
                placeholderTextColor="#888" 
                value={formData.lastName}
                onChangeText={(text) => handleChange('lastName', text)}
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>이름</Text>
              <TextInput 
                style={styles.input} 
                placeholder="길동" 
                placeholderTextColor="#888" 
                value={formData.firstName}
                onChangeText={(text) => handleChange('firstName', text)}
              />
            </View>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.label}>ID</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Enter your ID" 
              placeholderTextColor="#888" 
              autoCapitalize="none"
              value={formData.id}
              onChangeText={(text) => handleChange('id', text)}
            />
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.label}>Password</Text>
            <TextInput 
              style={styles.input} 
              secureTextEntry 
              placeholder="*********" 
              placeholderTextColor="#888" 
              value={formData.password}
              onChangeText={(text) => handleChange('password', text)}
            />
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput 
              style={styles.input} 
              secureTextEntry 
              placeholder="*********" 
              placeholderTextColor="#888" 
              value={formData.confirmPassword}
              onChangeText={(text) => handleChange('confirmPassword', text)}
            />
          </View>

          <TouchableOpacity style={styles.signUpButton} onPress={handleSignUp} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.signUpButtonText}>회원가입</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  innerContainer: { padding: 30, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  logo: { color: '#fff', fontSize: 40, fontWeight: 'bold', marginBottom: 40 },
  formWrapper: { width: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  halfInput: { width: '48%' },
  inputSection: { marginBottom: 15 },
  label: { color: '#fff', fontSize: 13, marginBottom: 5 },
  input: { backgroundColor: '#fff', borderRadius: 10, height: 50, paddingHorizontal: 15, color: '#000' },
  signUpButton: { backgroundColor: '#fff', borderRadius: 25, height: 50, justifyContent: 'center', marginTop: 20 },
  signUpButtonText: { textAlign: 'center', color: '#000', fontWeight: 'bold', fontSize: 16 },
});
