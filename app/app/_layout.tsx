import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { API_BASE_URL, checkServerConnection, getServerConfigurationError, SOCKET_URL } from '@/lib/api';
import { socket } from '@/socket';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const lastSocketErrorAt = useRef(0);

  useEffect(() => {
    const configurationError = getServerConfigurationError();
    console.log('[Network] API Base URL:', SOCKET_URL ? API_BASE_URL : '(not configured)');
    console.log('[Network] Socket URL:', SOCKET_URL || '(not configured)');
    console.log('[Network] Initial socket state:', socket.connected ? 'connected' : 'disconnected');
    if (configurationError) {
      console.error('[Network] Configuration error:', configurationError);
    } else {
      checkServerConnection().then((result) => {
        console.log('[Network] API health check:', result.ok ? 'connected' : 'failed', result.message);
      });
    }

    // 서버와 연결되면 클라이언트 콘솔에서 연결 성공을 확인할 수 있습니다.
    const handleConnect = () => {
      console.log('[Network] Socket connected:', socket.id, SOCKET_URL);
    };

    // 서버 연결이 끊어졌을 때도 콘솔에서 확인할 수 있습니다.
    const handleDisconnect = (reason: string) => {
      console.log('[Network] Socket disconnected:', reason);
    };

    const handleConnectError = (error: Error) => {
      const now = Date.now();
      if (now - lastSocketErrorAt.current < 15000) return;
      lastSocketErrorAt.current = now;

      const tunnelHint = SOCKET_URL.includes('.trycloudflare.com')
        ? ' 임시 터널이 종료됐을 수 있습니다. 백엔드 서버 실행 후 프로젝트 루트에서 npm run tunnel을 다시 실행하고 새 QR을 스캔하세요.'
        : '';
      console.error('[Network] Socket connection failed:', SOCKET_URL, error.message + tunnelHint);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // 앱이 시작될 때 Socket.IO 서버에 연결을 시도합니다.
    if (!configurationError) socket.connect();

    return () => {
      // 컴포넌트가 사라질 때 이벤트 등록을 해제하고 연결도 정리합니다.
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
