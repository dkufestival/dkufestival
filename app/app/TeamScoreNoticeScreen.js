import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { apiRequest, setActiveRoomId } from '../lib/api';
import { normalizeRoomCode, socket } from '../socket';

export default function TeamScoreNoticeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const roomCode = normalizeRoomCode(params.roomCode);
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [scoreboard, setScoreboard] = useState([]);
  const [teamCount, setTeamCount] = useState('2');
  const [loading, setLoading] = useState(false);

  const sortedScoreboard = useMemo(
    () => [...scoreboard].sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder),
    [scoreboard]
  );

  const applyState = useCallback((data = {}) => {
    if (Array.isArray(data.teams)) setTeams(data.teams);
    if (Array.isArray(data.members)) setMembers(data.members);
    if (Array.isArray(data.scoreboard)) setScoreboard(data.scoreboard);
  }, []);

  const syncState = useCallback(async () => {
    if (!roomCode) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/rooms/${roomCode}/collaboration`);
      applyState(data);
    } catch (error) {
      Alert.alert('관리 정보 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, [applyState, roomCode]);

  useEffect(() => {
    if (roomId) setActiveRoomId(roomId);
  }, [roomId]);

  useEffect(() => {
    if (!roomCode) return undefined;

    const joinAsHost = () => {
      socket.timeout(5000).emit('joinRoom', { roomCode, role: 'host' }, (error, response) => {
        if (error || !response?.ok) {
          Alert.alert('실시간 연결 실패', response?.message || '서버 연결을 확인해주세요.');
          return;
        }
        socket.emit('collaboration:sync', { roomCode }, (syncResponse) => {
          if (syncResponse?.ok) applyState(syncResponse);
        });
      });
    };
    const handleTeamUpdate = (data = {}) => {
      if (normalizeRoomCode(data.roomCode) === roomCode) applyState(data);
    };
    const handleScoreChanged = (data = {}) => {
      if (normalizeRoomCode(data.roomCode) === roomCode && Array.isArray(data.scoreboard)) {
        setScoreboard(data.scoreboard);
      }
    };

    socket.on('connect', joinAsHost);
    socket.on('team:update', handleTeamUpdate);
    socket.on('score:changed', handleScoreChanged);
    if (socket.connected) joinAsHost();
    else socket.connect();
    syncState();

    return () => {
      socket.off('connect', joinAsHost);
      socket.off('team:update', handleTeamUpdate);
      socket.off('score:changed', handleScoreChanged);
    };
  }, [applyState, roomCode, syncState]);

  const emitHostEvent = (eventName, payload, onSuccess) => {
    socket.timeout(5000).emit(eventName, { roomCode, ...payload }, (error, response) => {
      if (error || !response?.ok) {
        Alert.alert('요청 실패', response?.message || '서버 연결을 확인해주세요.');
        return;
      }
      onSuccess?.(response);
    });
  };

  const createTeams = () => {
    const count = Math.max(1, Math.min(Number(teamCount) || 2, 12));
    const nextTeams = Array.from({ length: count }, (_, index) => ({
      name: `Team ${String.fromCharCode(65 + index)}`,
      sortOrder: index + 1,
    }));
    emitHostEvent('team:update', { teams: nextTeams });
  };

  const saveTeamNames = () => {
    emitHostEvent('team:update', { teams });
  };

  const randomizeTeams = () => {
    emitHostEvent('team:randomize', { teamCount: Math.max(1, Math.min(Number(teamCount) || 2, 12)) });
  };

  const assignMember = (memberId, teamId) => {
    emitHostEvent('team:assign', { memberId, teamId });
  };

  const changeScore = (teamId, delta) => {
    emitHostEvent('score:update', { teamId, delta, reason: '진행자 수동 변경' }, (response) => {
      if (Array.isArray(response.scoreboard)) setScoreboard(response.scoreboard);
    });
  };

  const updateTeamName = (teamId, name) => {
    setTeams((current) => current.map((team) => (
      team.teamId === teamId ? { ...team, name } : team
    )));
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.logoText}>Playce</Text>
        <TouchableOpacity style={styles.iconButton} onPress={syncState}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={styles.roomText}>방 코드 {roomCode || '-'}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator color="#fff" style={{ marginBottom: 12 }} />}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>팀 관리</Text>
          <View style={styles.inlineRow}>
            <TextInput
              style={styles.smallInput}
              value={teamCount}
              onChangeText={setTeamCount}
              keyboardType="number-pad"
              maxLength={2}
            />
            <TouchableOpacity style={styles.darkButton} onPress={createTeams}>
              <Text style={styles.darkButtonText}>기본 팀 만들기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.darkButton} onPress={randomizeTeams}>
              <Text style={styles.darkButtonText}>랜덤 배정</Text>
            </TouchableOpacity>
          </View>
          {teams.map((team) => (
            <View key={team.teamId || team.name} style={styles.teamEditRow}>
              <TextInput
                style={styles.teamInput}
                value={team.name}
                onChangeText={(value) => updateTeamName(team.teamId, value)}
              />
              <Text style={styles.memberCount}>{team.members?.length || 0}명</Text>
            </View>
          ))}
          {teams.length > 0 && (
            <TouchableOpacity style={styles.saveButton} onPress={saveTeamNames}>
              <Text style={styles.saveButtonText}>팀 이름 저장</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>참가자 배정</Text>
          {members.length === 0 ? (
            <Text style={styles.emptyText}>참가자가 없습니다.</Text>
          ) : members.map((member) => (
            <View key={member.memberId} style={styles.memberRow}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberTeam}>{member.team?.name || '미배정'}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamChips}>
                {teams.map((team) => (
                  <TouchableOpacity
                    key={team.teamId}
                    style={[styles.chip, member.team?.teamId === team.teamId ? styles.chipActive : null]}
                    onPress={() => assignMember(member.memberId, team.teamId)}
                  >
                    <Text style={[styles.chipText, member.team?.teamId === team.teamId ? styles.chipTextActive : null]}>
                      {team.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>점수판</Text>
          {sortedScoreboard.length === 0 ? (
            <Text style={styles.emptyText}>팀을 먼저 만들어주세요.</Text>
          ) : sortedScoreboard.map((team, index) => (
            <View key={team.teamId} style={styles.scoreRow}>
              <View>
                <Text style={styles.scoreName}>{index + 1}위 · {team.name}</Text>
                <Text style={styles.scoreValue}>{team.score}점</Text>
              </View>
              <View style={styles.scoreButtons}>
                <TouchableOpacity style={styles.scoreButton} onPress={() => changeScore(team.teamId, -10)}>
                  <Text style={styles.scoreButtonText}>-10</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.scoreButton} onPress={() => changeScore(team.teamId, 10)}>
                  <Text style={styles.scoreButtonText}>+10</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.scoreButton} onPress={() => changeScore(team.teamId, 50)}>
                  <Text style={styles.scoreButtonText}>+50</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { height: 74, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 38, fontWeight: 'bold', color: '#FFF' },
  roomText: { color: '#bbb', textAlign: 'center', marginBottom: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 34, gap: 14 },
  panel: { backgroundColor: '#FFF', borderRadius: 15, padding: 14 },
  panelTitle: { color: '#000', fontSize: 18, fontWeight: '900', marginBottom: 12 },
  inlineRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  smallInput: { width: 48, height: 42, borderRadius: 10, backgroundColor: '#EEE', color: '#000', textAlign: 'center', fontWeight: 'bold' },
  darkButton: { flex: 1, minHeight: 42, borderRadius: 21, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  darkButtonText: { color: '#FFF', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  teamEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  teamInput: { flex: 1, height: 42, borderRadius: 10, backgroundColor: '#EEE', color: '#000', paddingHorizontal: 12, fontWeight: '700' },
  memberCount: { width: 46, color: '#555', fontWeight: '800', textAlign: 'right' },
  saveButton: { height: 44, borderRadius: 22, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveButtonText: { color: '#FFF', fontWeight: '900' },
  emptyText: { color: '#777', textAlign: 'center', paddingVertical: 12, fontWeight: '700' },
  memberRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  memberInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  memberName: { color: '#000', fontSize: 15, fontWeight: '900' },
  memberTeam: { color: '#666', fontSize: 13, fontWeight: '700' },
  teamChips: { gap: 8 },
  chip: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: '#DDD', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#000', borderColor: '#000' },
  chipText: { color: '#333', fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: '#FFF' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  scoreName: { color: '#000', fontSize: 16, fontWeight: '900' },
  scoreValue: { color: '#555', fontSize: 13, fontWeight: '800', marginTop: 2 },
  scoreButtons: { flexDirection: 'row', gap: 7 },
  scoreButton: { minWidth: 42, height: 34, borderRadius: 17, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  scoreButtonText: { color: '#FFF', fontWeight: '900' },
});
