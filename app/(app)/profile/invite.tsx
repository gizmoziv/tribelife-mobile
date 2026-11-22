import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  SectionList,
  FlatList,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { FONTS, SPACING, RADIUS, SHADOWS, COLORS } from '@/constants';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { PillButton } from '@/components/ui/PillButton';
import {
  inviteLink,
  personalInvite,
  firstNameOf,
  displayNameOf,
  pickPhones,
  initialOf,
  sectionKeyOf,
  isRTLText,
  invitedLabel,
} from '@/utils/inviteText';

// ── Lazy native modules ──────────────────────────────────────────────────────
// expo-router evaluates every route file at startup and both packages call
// requireNativeModule when they load, so a top-level import would crash the whole
// app on a binary that lacks the native modules. They are required lazily, and
// only after the native module is confirmed present. Type queries are erased at
// build time and keep tsc checking every call.
type ContactsModule = typeof import('expo-contacts');
type SmsModule = typeof import('expo-sms');

let contactsModuleCache: ContactsModule | null = null;
let smsModuleCache: SmsModule | null = null;

function inviteContactsModule(): ContactsModule | null {
  if (contactsModuleCache) return contactsModuleCache;
  if (requireOptionalNativeModule('ExpoContactsNext') == null) return null;
  contactsModuleCache = require('expo-contacts') as ContactsModule;
  return contactsModuleCache;
}

function inviteSmsModule(): SmsModule | null {
  if (smsModuleCache) return smsModuleCache;
  if (requireOptionalNativeModule('ExpoSMS') == null) return null;
  smsModuleCache = require('expo-sms') as SmsModule;
  return smsModuleCache;
}

// ── Types ────────────────────────────────────────────────────────────────────
type Step = 'boot' | 'intro' | 'loading' | 'denied' | 'pick' | 'list';
type Access = 'all' | 'limited' | 'denied';
type SendResult = 'sent' | 'cancelled' | 'unknown' | 'failed';

interface InviteContact {
  id: string;
  name: string;
  first: string;
  phones: string[];
}

interface LoadedContacts {
  contacts: InviteContact[];
  hiddenCount: number;
}

const INTRO_KEY = 'invite_intro_seen';
const INTRO_BODY = 'Pick a few friends from your contacts and send each one a personal invite by text or WhatsApp.';

// ── Native helpers (module-level named functions) ────────────────────────────
async function inviteEnsureAccess(allowPrompt: boolean): Promise<Access> {
  const C = inviteContactsModule();
  if (!C) return 'denied';
  let perm = await C.getPermissionsAsync();
  if (perm.status === 'undetermined' && allowPrompt) {
    perm = await C.requestPermissionsAsync();
  }
  if (!perm.granted) return 'denied';
  if (perm.accessPrivileges === 'limited') return 'limited';
  return 'all';
}

async function inviteLoadContacts(): Promise<LoadedContacts> {
  const C = inviteContactsModule();
  if (!C) return { contacts: [], hiddenCount: 0 };
  const rows = await C.Contact.getAllDetails(
    [
      C.ContactField.GIVEN_NAME,
      C.ContactField.FAMILY_NAME,
      C.ContactField.FULL_NAME,
      C.ContactField.PHONES,
    ] as const,
    { sortOrder: C.ContactsSortOrder.UserDefault },
  );
  const contacts: InviteContact[] = [];
  let hiddenCount = 0;
  for (const row of rows) {
    const phones = pickPhones(row.phones ?? []);
    if (phones.length === 0) {
      hiddenCount += 1;
      continue;
    }
    contacts.push({
      id: row.id,
      name: displayNameOf(row.fullName, row.givenName, row.familyName, phones[0]),
      first: firstNameOf(row.givenName, row.fullName),
      phones,
    });
  }
  return { contacts, hiddenCount };
}

async function inviteSendText(rawNumber: string, body: string): Promise<SendResult> {
  const S = inviteSmsModule();
  if (!S) return 'failed';
  try {
    // Exactly one address string, never a list: one person per composer.
    const response = await S.sendSMSAsync(rawNumber, body);
    return response.result;
  } catch {
    return 'failed';
  }
}

async function inviteReadIntroSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_KEY)) === '1';
  } catch {
    return false;
  }
}

function inviteWriteIntroSeen(): void {
  AsyncStorage.setItem(INTRO_KEY, '1').catch(() => {});
}

function nonePhoneNote(count: number): string {
  if (count === 1) return "1 contact without a phone number isn't shown";
  return `${count} contacts without a phone number aren't shown`;
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function InviteScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const handle = useAuthStore((s) => s.user?.handle) ?? '';
  const link = inviteLink(handle);

  const [step, setStep] = useState<Step>('boot');
  const [access, setAccess] = useState<Access>('denied');
  const [contacts, setContacts] = useState<InviteContact[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [invited, setInvited] = useState<Record<string, string>>({});
  const sendingRef = useRef(false);

  const headerTop = Platform.select({ android: insets.top, default: 0 });

  const accessAndLoad = useCallback(async () => {
    setStep('loading');
    try {
      const level = await inviteEnsureAccess(true);
      if (level === 'denied') {
        setStep('denied');
        return;
      }
      const loaded = await inviteLoadContacts();
      setAccess(level);
      setContacts(loaded.contacts);
      setHiddenCount(loaded.hiddenCount);
      if (level === 'limited') {
        // iOS limited access: the shared set IS the selection.
        setSelectedIds(loaded.contacts.map((c) => c.id));
        setStep('list');
        return;
      }
      setStep('pick');
    } catch (err) {
      console.error('[invite]', err);
      Alert.alert("Couldn't load contacts", 'Please try again in a moment.');
      setStep('denied');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    inviteReadIntroSeen().then((seen) => {
      if (!alive) return;
      if (seen) {
        accessAndLoad();
        return;
      }
      setStep('intro');
    });
    return () => {
      alive = false;
    };
  }, [accessAndLoad]);

  const handleContinueIntro = useCallback(() => {
    inviteWriteIntroSeen();
    accessAndLoad();
  }, [accessAndLoad]);

  const toggleChecked = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleContinuePick = useCallback(() => {
    setSelectedIds(checkedIds);
    setStep('list');
  }, [checkedIds]);

  const handleEditSelection = useCallback(() => {
    setCheckedIds(selectedIds);
    setStep('pick');
  }, [selectedIds]);

  const markInvited = useCallback((id: string) => {
    setInvited((prev) => ({ ...prev, [id]: new Date().toISOString() }));
  }, []);

  const handleText = useCallback(
    async (contact: InviteContact) => {
      if (sendingRef.current) return;
      if (!handle) return;
      sendingRef.current = true;
      try {
        const body = personalInvite(contact.first, link);
        const result = await inviteSendText(contact.phones[0], body);
        if (result === 'sent' || result === 'unknown') {
          markInvited(contact.id);
          return;
        }
        if (result === 'failed') {
          Alert.alert(
            "Couldn't open Messages",
            "This device can't send text messages. Try WhatsApp instead.",
          );
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [handle, link, markInvited],
  );

  const sections = useMemo(() => {
    const byKey = new Map<string, InviteContact[]>();
    for (const c of contacts) {
      const key = sectionKeyOf(c.name);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(c);
      else byKey.set(key, [c]);
    }
    const keys = Array.from(byKey.keys()).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => ({ title: key, data: byKey.get(key) ?? [] }));
  }, [contacts]);

  const selectedContacts = useMemo(() => {
    const set = new Set(selectedIds);
    return contacts.filter((c) => set.has(c.id));
  }, [contacts, selectedIds]);

  const bottomPad = tabBarSpace + SPACING.md;

  const renderIntro = () => (
    <View style={styles.introWrap}>
      <View style={styles.introBody}>
        <Text style={[styles.introLabel, { color: COLORS.primary }]}>Invite Friends</Text>
        <Text style={[styles.introHeading, { color: colors.text }]}>
          Bring your people to TribeLife
        </Text>
        <Text style={[styles.introText, { color: colors.textMuted }]}>{INTRO_BODY}</Text>
        <PillButton
          title="Continue"
          onPress={handleContinueIntro}
          variant="primary"
          style={{ marginTop: SPACING.lg }}
        />
      </View>
      <Text style={[styles.introFooter, { color: colors.textMuted, paddingBottom: bottomPad }]}>
        🔒 Your contacts stay on your phone. We never upload them or message anyone for you.
      </Text>
    </View>
  );

  const renderDenied = () => (
    <View style={styles.centerWrap}>
      <Text style={[styles.deniedText, { color: colors.text }]}>
        Contacts access is off for TribeLife. You can turn it on in Settings.
      </Text>
      <PillButton
        title="Open Settings"
        onPress={() => {
          Linking.openSettings().catch(() => {});
        }}
        variant="primary"
        style={{ marginTop: SPACING.md }}
      />
    </View>
  );

  const renderPick = () => (
    <View style={styles.flex}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: SPACING.md }}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const checked = checkedIds.includes(item.id);
          return (
            <Pressable
              onPress={() => toggleChecked(item.id)}
              style={({ pressed }) => [styles.pickRow, { opacity: pressed ? 0.8 : 1 }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: checked ? COLORS.primary : colors.border,
                    backgroundColor: checked ? COLORS.primary : 'transparent',
                  },
                ]}
              >
                {checked && (
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M5 12l5 5 9-10"
                      stroke="#FFFFFF"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                )}
              </View>
              <Avatar name={item.name} bg={colors.surfaceElevated} fg={colors.text} />
              <View style={styles.rowText}>
                <Text
                  style={[
                    styles.rowName,
                    { color: colors.text },
                    isRTLText(item.name) && styles.rtl,
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text style={[styles.rowPhone, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.phones[0]}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          hiddenCount > 0 ? (
            <Text style={[styles.footNote, { color: colors.textMuted }]}>
              {nonePhoneNote(hiddenCount)}
            </Text>
          ) : null
        }
      />
      <View style={[styles.bottomBar, { paddingBottom: bottomPad, backgroundColor: colors.background }]}>
        <PillButton
          title={`Continue (${checkedIds.length})`}
          onPress={handleContinuePick}
          variant="primary"
          disabled={checkedIds.length === 0}
        />
      </View>
    </View>
  );

  const renderList = () => (
    <FlatList
      data={selectedContacts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      ListHeaderComponent={
        access === 'all' ? (
          <Pressable onPress={handleEditSelection} hitSlop={8} style={styles.editLink}>
            <Text style={[styles.editLinkText, { color: COLORS.primary }]}>Edit selection</Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={
        <Text style={[styles.footNote, { color: colors.textMuted }]}>
          No contacts with a phone number to invite.
        </Text>
      }
      ListFooterComponent={
        hiddenCount > 0 ? (
          <Text style={[styles.footNote, { color: colors.textMuted }]}>
            {nonePhoneNote(hiddenCount)}
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={styles.listRow}>
          <Avatar name={item.name} bg={colors.surfaceElevated} fg={colors.text} />
          <View style={styles.rowText}>
            <Text
              style={[
                styles.rowName,
                { color: colors.text },
                isRTLText(item.name) && styles.rtl,
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text style={[styles.rowPhone, { color: colors.textMuted }]} numberOfLines={1}>
              {item.phones[0]}
            </Text>
            {invited[item.id] ? (
              <Text style={[styles.invitedText, { color: COLORS.primary }]}>
                {invitedLabel(invited[item.id])}
              </Text>
            ) : null}
          </View>
          <RowButton label="Text" color={COLORS.primary} onPress={() => handleText(item)} />
        </View>
      )}
    />
  );

  let body: React.ReactNode = null;
  if (step === 'intro') body = renderIntro();
  else if (step === 'loading' || step === 'boot') {
    body = (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  } else if (step === 'denied') body = renderDenied();
  else if (step === 'pick') body = renderPick();
  else body = renderList();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <CustomHeader
        title="Invite Friends"
        backLabel="Profile"
        onBack={() => router.back()}
        colors={colors}
        insetsTop={headerTop}
      />
      {body}
    </SafeAreaView>
  );
}

// ── Row pieces ───────────────────────────────────────────────────────────────
function Avatar({ name, bg, fg }: { name: string; bg: string; fg: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: fg }]}>{initialOf(name)}</Text>
    </View>
  );
}

function RowButton({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.rowButton, { borderColor: color, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.rowButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ── Custom header ────────────────────────────────────────────────────────────
interface CustomHeaderProps {
  title: string;
  onBack: () => void;
  colors: { background: string; surfaceGlass: string; text: string; textMuted: string };
  insetsTop: number;
  backLabel?: string;
}

function CustomHeader({ title, onBack, colors, insetsTop, backLabel = 'Profile' }: CustomHeaderProps) {
  return (
    <View
      style={[
        styles.headerRow,
        {
          paddingTop: insetsTop + 6,
          backgroundColor: colors.background,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [
          styles.headerBackPill,
          { backgroundColor: colors.surfaceGlass, opacity: pressed ? 0.8 : 1 },
          SHADOWS.sm,
        ]}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M15 18l-6-6 6-6" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={[styles.headerBackText, { color: colors.text }]}>{backLabel}</Text>
      </Pressable>
      <View style={styles.headerTitleWrap} pointerEvents="none">
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  headerRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.page,
    paddingBottom: 10,
  },
  headerBackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  headerBackText: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  headerTitleWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: FONTS.semiBold,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.page,
  },
  introWrap: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.page,
  },
  introBody: {
    flex: 1,
    justifyContent: 'center',
  },
  introLabel: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  introHeading: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: FONTS.bold,
    marginBottom: SPACING.md,
  },
  introText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONTS.regular,
  },
  introFooter: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingTop: SPACING.md,
  },
  deniedText: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: FONTS.medium,
    textAlign: 'center',
  },
  sectionHeader: {
    paddingHorizontal: SPACING.page,
    paddingVertical: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.page,
    paddingVertical: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.page,
    paddingVertical: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  rtl: {
    writingDirection: 'rtl',
  },
  rowPhone: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  invitedText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    marginTop: 4,
  },
  rowButton: {
    borderWidth: 1.5,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  rowButtonText: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  editLink: {
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm,
    alignSelf: 'flex-start',
  },
  editLinkText: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  footNote: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.md,
  },
  bottomBar: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
  },
});
