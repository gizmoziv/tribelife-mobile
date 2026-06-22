import React, { useEffect, useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer, { PLAYER_STATES } from 'react-native-youtube-iframe';
import Svg, { Path } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PLAYER_HEIGHT = Math.round((SCREEN_WIDTH * 9) / 16);

interface YouTubePlayerModalProps {
  visible: boolean;
  videoId: string | null;
  onClose: () => void;
}

// Same close icon as ImageViewer for a consistent full-screen-modal UX.
function CloseIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke="#FFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Full-screen in-app YouTube player, structurally modeled on ImageViewer:
 * a transparent fade Modal over a dark scrim with a top-left close button.
 * The <YoutubePlayer> (which mounts a webview) is rendered ONLY while the
 * modal is visible with a videoId, so closing the modal unmounts the player —
 * guaranteeing teardown and stopping audio. Autoplays on open.
 */
export function YouTubePlayerModal({ visible, videoId, onClose }: YouTubePlayerModalProps) {
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Autoplay whenever the modal opens with a video; ensure paused otherwise.
    setPlaying(visible && !!videoId);
  }, [visible, videoId]);

  const handleClose = () => {
    // Pause before closing; conditional render below also unmounts the player.
    setPlaying(false);
    onClose();
  };

  const handleChangeState = (state: PLAYER_STATES) => {
    // Don't auto-restart when a video naturally ends.
    if (state === PLAYER_STATES.ENDED) {
      setPlaying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton} hitSlop={12}>
            <CloseIcon />
          </TouchableOpacity>
        </View>
        <View style={styles.playerWrap}>
          {visible && videoId ? (
            <YoutubePlayer
              height={PLAYER_HEIGHT}
              width={SCREEN_WIDTH}
              videoId={videoId}
              play={playing}
              onChangeState={handleChangeState}
              forceAndroidAutoplay
              webViewStyle={styles.webView}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export default YouTubePlayerModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerWrap: {
    flex: 1,
    justifyContent: 'center',
    width: SCREEN_WIDTH,
  },
  webView: {
    backgroundColor: 'transparent',
  },
});
