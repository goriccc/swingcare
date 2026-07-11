/**
 * 카메라 권한 거부 시 캡처 화면 대신 안내 UI.
 * Android는 PermissionsAndroid로 요청하고, 영구 거부 시에만 설정으로 이동한다.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface CameraPermissionGateProps {
  children: ReactNode;
}

async function checkAndroidCameraGranted(): Promise<boolean> {
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
}

export default function CameraPermissionGate({
  children,
}: CameraPermissionGateProps) {
  const insets = useSafeAreaInsets();
  const vision = useCameraPermission();
  const [androidGranted, setAndroidGranted] = useState(false);
  const [androidBlocked, setAndroidBlocked] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [didAutoRequest, setDidAutoRequest] = useState(false);

  const hasPermission =
    Platform.OS === 'android' ? androidGranted : vision.hasPermission;

  const refreshAndroid = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return;
    }
    const granted = await checkAndroidCameraGranted();
    setAndroidGranted(granted);
    if (granted) {
      setAndroidBlocked(false);
    }
  }, []);

  useEffect(() => {
    void refreshAndroid();
  }, [refreshAndroid]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        return;
      }
      if (Platform.OS === 'android') {
        void refreshAndroid();
        return;
      }
      if (!vision.hasPermission && vision.canRequestPermission) {
        void vision.requestPermission();
      }
    });
    return () => sub.remove();
  }, [refreshAndroid, vision]);

  const requestAndroid = useCallback(async () => {
    setIsRequesting(true);
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: '카메라 권한',
          message:
            '스윙 자세 안내를 위해 카메라 접근이 필요합니다.',
          buttonPositive: '허용',
          buttonNegative: '거부',
        },
      );
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        setAndroidGranted(true);
        setAndroidBlocked(false);
        return;
      }
      setAndroidGranted(false);
      // 다시 묻지 않음 → 설정에서만 켤 수 있음
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        setAndroidBlocked(true);
      }
    } finally {
      setIsRequesting(false);
    }
  }, []);

  const requestIos = useCallback(async () => {
    setIsRequesting(true);
    try {
      await vision.requestPermission();
    } finally {
      setIsRequesting(false);
    }
  }, [vision]);

  // 최초 1회 시스템 권한 다이얼로그
  useEffect(() => {
    if (hasPermission || didAutoRequest || isRequesting) {
      return;
    }
    if (Platform.OS === 'android') {
      setDidAutoRequest(true);
      void requestAndroid();
      return;
    }
    if (vision.canRequestPermission) {
      setDidAutoRequest(true);
      void requestIos();
    }
  }, [
    didAutoRequest,
    hasPermission,
    isRequesting,
    requestAndroid,
    requestIos,
    vision.canRequestPermission,
  ]);

  const openAppSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  if (hasPermission) {
    return <>{children}</>;
  }

  const showSettingsCta =
    Platform.OS === 'android'
      ? androidBlocked
      : !vision.canRequestPermission;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>카메라 권한이 필요합니다</Text>
      <Text style={styles.body}>
        스윙 자세 안내를 위해 카메라 접근이 필요합니다. 권한이 꺼져 있으면 촬영을
        시작할 수 없습니다.
        {showSettingsCta
          ? ' 아래 버튼으로 앱 설정 → 권한에서 카메라를 허용해 주세요.'
          : ''}
      </Text>
      {showSettingsCta ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="설정에서 카메라 권한 허용하기"
          onPress={openAppSettings}
          style={styles.button}
        >
          <Text style={styles.buttonText}>설정에서 카메라 권한 허용하기</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="카메라 권한 허용"
          onPress={() => {
            if (Platform.OS === 'android') {
              void requestAndroid();
            } else {
              void requestIos();
            }
          }}
          style={styles.button}
          disabled={isRequesting}
        >
          <Text style={styles.buttonText}>
            {isRequesting ? '요청 중…' : '카메라 권한 허용하기'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FDFDFD',
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#232630',
  },
  body: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7A8198',
    lineHeight: 22,
  },
  button: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#208AEF',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
