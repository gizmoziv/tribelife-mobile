import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  MESSAGE_INPUT_MAX_LENGTH,
  friendlySendFailure,
  sendChunksInOrder,
  splitMessage,
  unsentRemainder,
  type ChunkSendAck,
} from '@/utils/splitMessage';

interface StartChunkedSendOptions {
  /** The full trimmed text that was split (used to rebuild the unsent remainder). */
  content: string;
  chunks: string[];
  emitChunk: (chunk: string, index: number) => Promise<ChunkSendAck>;
  minGapMs?: number;
  onChunkFailed?: (index: number) => void;
  /** Re-stage the reply quote / attachment when nothing was sent (part 1 failed). */
  restoreFirstChunkExtras?: () => void;
}

/**
 * Shared "long message" send flow for every chat screen: splits text over the
 * per-message cap, sends the parts strictly in order, and on any failure puts the
 * exact unsent text back in the composer with one alert (quick 261002-w9b).
 */
export function useChunkedSend(input: string, setInput: (text: string) => void) {
  const [sendingChunks, setSendingChunks] = useState(false);
  const inFlightRef = useRef(false);
  const latestInputRef = useRef(input);
  latestInputRef.current = input;

  /** Split `content`, or alert and return null when it exceeds the per-send bound. */
  const prepareChunks = useCallback((content: string): string[] | null => {
    if (content.length > MESSAGE_INPUT_MAX_LENGTH) {
      Alert.alert(
        'Message Too Long',
        `Messages can be up to ${MESSAGE_INPUT_MAX_LENGTH} characters per send. Your message is ${content.length} characters. Please shorten it and try again.`,
      );
      return null;
    }
    return splitMessage(content);
  }, []);

  const startChunkedSend = useCallback(
    (opts: StartChunkedSendOptions): boolean => {
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      setSendingChunks(true);

      void (async () => {
        try {
          const result = await sendChunksInOrder(opts.chunks, opts.emitChunk, { minGapMs: opts.minGapMs });
          if (result.failedIndex === null) return;

          opts.onChunkFailed?.(result.failedIndex);
          const remainder = unsentRemainder(opts.content, opts.chunks, result.failedIndex);
          const typedMeanwhile = latestInputRef.current.trim();
          setInput(typedMeanwhile ? `${remainder}\n\n${latestInputRef.current}` : remainder);
          if (result.failedIndex === 0) opts.restoreFirstChunkExtras?.();
          Alert.alert(
            result.sentCount === 0 ? 'Message Not Sent' : 'Message Not Fully Sent',
            `${friendlySendFailure(result.reason)} The unsent text is back in the message box.`,
          );
        } finally {
          inFlightRef.current = false;
          setSendingChunks(false);
        }
      })();

      return true;
    },
    [setInput],
  );

  return { sendingChunks, prepareChunks, startChunkedSend };
}
