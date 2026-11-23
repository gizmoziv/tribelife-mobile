import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  SectionList,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getLocales } from 'expo-localization';
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
import { ActionSheetModal } from '@/components/ui/ActionSheetModal';
import { intlPhone } from '@/utils/phoneIntl';
import {
  inviteLink,
  personalInvite,
  genericInvite,
  linkedInShareUrl,
  firstNameOf,
  displayNameOf,
  pickPhones,
  initialOf,
  sectionKeyOf,
  isRTLText,
  invitedLabel,
  matchesQuery,
  hiddenNote,
  whatsAppUrl,
  parseInvitedMap,
  parseIdList,
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
type Step = 'boot' | 'intro' | 'loading' | 'denied' | 'error' | 'pick' | 'list';
type Access = 'all' | 'limited' | 'denied';
type SendResult = 'sent' | 'cancelled' | 'unknown' | 'failed';
type Channel = 'text' | 'whatsapp';

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
const INVITED_KEY = 'invite_invited_map';
const SELECTED_KEY = 'invite_selected_ids';
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
    // No sortOrder: expo-contacts 57.0.9 sends ContactsSortOrder.UserDefault as 'userDefault' but the
    // iOS native enum only accepts 'useDefault' → ERR_ARGUMENT_CAST on every load. Sorted in JS below.
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
  contacts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
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

async function inviteSmsAvailable(): Promise<boolean> {
  const S = inviteSmsModule();
  if (!S) return false;
  try {
    return await S.isAvailableAsync();
  } catch {
    return false;
  }
}

async function inviteSendWhatsApp(digits: string | null, body: string): Promise<boolean> {
  try {
    // Documented https click-to-chat link only: no app-scheme URL, no installed-app probe.
    await Linking.openURL(whatsAppUrl(digits, body));
    return true;
  } catch {
    return false;
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

// On-device only: contact ids with ISO dates, and an id list. Never names or numbers.
async function inviteReadInvited(): Promise<Record<string, string>> {
  try {
    return parseInvitedMap(await AsyncStorage.getItem(INVITED_KEY));
  } catch {
    return {};
  }
}

function inviteWriteInvited(map: Record<string, string>): void {
  AsyncStorage.setItem(INVITED_KEY, JSON.stringify(map)).catch(() => {});
}

async function inviteReadSelected(): Promise<string[]> {
  try {
    return parseIdList(await AsyncStorage.getItem(SELECTED_KEY));
  } catch {
    return [];
  }
}

function inviteWriteSelected(ids: string[]): void {
  AsyncStorage.setItem(SELECTED_KEY, JSON.stringify(ids)).catch(() => {});
}

// iOS 18+ limited access: Apple's picker adds contacts to the shared set. It resolves
// with only the newly granted ids, so callers reload the whole set afterwards.
async function inviteSelectMore(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const C = inviteContactsModule();
  if (!C) return;
  try {
    await C.Contact.presentAccessPicker();
  } catch {
    // Below iOS 18, or a picker is already open.
  }
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
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [chooser, setChooser] = useState<{ contact: InviteContact; channel: Channel } | null>(null);
  const sendingRef = useRef(false);
  const recheckingRef = useRef(false);
  const invitedRef = useRef<Record<string, string>>({});
  const region = useMemo(() => getLocales()[0]?.regionCode ?? null, []);

  const headerTop = Platform.select({ android: insets.top, default: 0 });

  useEffect(() => {
    let alive = true;
    inviteReadInvited().then((saved) => {
      if (!alive) return;
      invitedRef.current = { ...saved, ...invitedRef.current };
      setInvited(invitedRef.current);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    inviteSmsAvailable().then((available) => {
      if (alive) setSmsAvailable(available);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Load contacts for a granted access level and route to the right view.
  const loadForLevel = useCallback(async (level: Access) => {
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
    // Full access: bring back the user's own earlier selection, if any still exists.
    const saved = await inviteReadSelected();
    const present = new Set(loaded.contacts.map((c) => c.id));
    const restored = saved.filter((id) => present.has(id));
    if (restored.length > 0) {
      setSelectedIds(restored);
      setStep('list');
      return;
    }
    setStep('pick');
  }, []);

  const accessAndLoad = useCallback(async () => {
    setStep('loading');
    try {
      const level = await inviteEnsureAccess(true);
      if (level === 'denied') {
        setStep('denied');
        return;
      }
      await loadForLevel(level);
    } catch (err) {
      console.error('[invite]', err);
      // A load failure is not a permission denial: show a retry, not "access is off".
      setStep('error');
    }
  }, [loadForLevel]);

  // Denied: when the user comes back from Settings with access granted, load on this screen.
  useEffect(() => {
    if (step !== 'denied') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || recheckingRef.current) return;
      recheckingRef.current = true;
      inviteEnsureAccess(false)
        .then(async (level) => {
          if (level === 'denied') return;
          setStep('loading');
          try {
            await loadForLevel(level);
          } catch (err) {
            console.error('[invite]', err);
            setStep('denied');
          }
        })
        .catch(() => {})
        .finally(() => {
          recheckingRef.current = false;
        });
    });
    return () => {
      subscription.remove();
    };
  }, [step, loadForLevel]);

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
    setQuery('');
    inviteWriteSelected(checkedIds);
    setSelectedIds(checkedIds);
    setStep('list');
  }, [checkedIds]);

  const handleEditSelection = useCallback(() => {
    setQuery('');
    setCheckedIds(selectedIds);
    setStep('pick');
  }, [selectedIds]);

  const markInvited = useCallback((id: string) => {
    invitedRef.current = { ...invitedRef.current, [id]: new Date().toISOString() };
    setInvited(invitedRef.current);
    inviteWriteInvited(invitedRef.current);
  }, []);

  const sendTo = useCallback(
    async (contact: InviteContact, channel: Channel, number: string) => {
      if (sendingRef.current) return;
      if (!handle) return;
      sendingRef.current = true;
      try {
        const body = personalInvite(contact.first, link);
        if (channel === 'text') {
          const result = await inviteSendText(number, body);
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
          return;
        }
        const digits = intlPhone(number, region)?.waDigits ?? null;
        const opened = await inviteSendWhatsApp(digits, body);
        if (opened) {
          markInvited(contact.id);
          return;
        }
        Alert.alert("Couldn't open WhatsApp", 'Please try again, or use Text.');
      } finally {
        sendingRef.current = false;
      }
    },
    [handle, link, markInvited, region],
  );

  const handleSend = useCallback(
    (contact: InviteContact, channel: Channel) => {
      if (contact.phones.length > 1) {
        setChooser({ contact, channel });
        return;
      }
      sendTo(contact, channel, contact.phones[0]);
    },
    [sendTo],
  );

  const shareWhatsApp = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    const opened = await inviteSendWhatsApp(null, genericInvite(link));
    if (!opened) Alert.alert("Couldn't open WhatsApp", 'Please try again.');
  }, [link]);

  const shareLinkedIn = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      await Linking.openURL(linkedInShareUrl(link));
    } catch {
      Alert.alert("Couldn't open LinkedIn", 'Please try again.');
    }
  }, [link]);

  const shareMore = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      await Share.share({ message: genericInvite(link) });
    } catch {
      // Cancelled or unavailable: nothing to report.
    }
  }, [link]);

  const chooserActions = useMemo(() => {
    if (!chooser) return [];
    const labels = new Set<string>();
    return chooser.contact.phones.map((number) => {
      let label = intlPhone(number, region)?.display ?? number;
      if (labels.has(label)) label = `${label} (${number})`;
      labels.add(label);
      return {
        label,
        onPress: () => {
          const { contact, channel } = chooser;
          setChooser(null);
          sendTo(contact, channel, number);
        },
      };
    });
  }, [chooser, region, sendTo]);

  const handleSelectMore = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    await inviteSelectMore();
    try {
      const loaded = await inviteLoadContacts();
      setContacts(loaded.contacts);
      setHiddenCount(loaded.hiddenCount);
      // Limited access: the whole shared set is the selection, so replace, never merge.
      setSelectedIds(loaded.contacts.map((c) => c.id));
    } catch {
      // Keep what is on screen.
    }
  }, []);

  const filteredContacts = useMemo(
    () => contacts.filter((c) => matchesQuery(c.name, c.phones, deferredQuery)),
    [contacts, deferredQuery],
  );

  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);

  const sections = useMemo(() => {
    const byKey = new Map<string, InviteContact[]>();
    for (const c of filteredContacts) {
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
  }, [filteredContacts]);

  const selectedContacts = useMemo(() => {
    const set = new Set(selectedIds);
    return contacts.filter((c) => set.has(c.id));
  }, [contacts, selectedIds]);

  const bottomPad = tabBarSpace + SPACING.md;

  const shareRow = handle ? (
    <ShareRow
      onWhatsApp={shareWhatsApp}
      onLinkedIn={shareLinkedIn}
      onMore={shareMore}
      borderColor={colors.border}
      textColor={colors.text}
    />
  ) : null;
  const previewCard = (
    <PreviewCard
      text={personalInvite('[first name]', link)}
      cardColor={colors.surfaceElevated}
      textColor={colors.text}
      mutedColor={colors.textMuted}
    />
  );

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
    <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>
      {shareRow}
      <View style={styles.deniedWrap}>
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
    </ScrollView>
  );

  const renderError = () => (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>
      {shareRow}
      <View style={styles.deniedWrap}>
        <Text style={[styles.deniedText, { color: colors.text }]}>
          Couldn't load your contacts. Please try again.
        </Text>
        <PillButton
          title="Try again"
          onPress={() => {
            void accessAndLoad();
          }}
          variant="primary"
          style={{ marginTop: SPACING.md }}
        />
      </View>
    </ScrollView>
  );

  const renderPickItem = ({ item }: { item: InviteContact }) => (
    <PickRow
      item={item}
      checked={checkedSet.has(item.id)}
      region={region}
      onToggle={toggleChecked}
      borderColor={colors.border}
      avatarBg={colors.surfaceElevated}
      textColor={colors.text}
      mutedColor={colors.textMuted}
    />
  );

  const renderPick = () => (
    <View style={styles.flex}>
      <View style={[styles.searchBox, { backgroundColor: colors.surfaceElevated }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search contacts"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          style={[styles.searchInput, { color: colors.text }]}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M6 6l12 12M18 6L6 18"
                stroke={colors.textMuted}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </Svg>
          </Pressable>
        ) : null}
      </View>
      <SectionList
        sections={sections}
        extraData={checkedSet}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        initialNumToRender={20}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: SPACING.md }}
        ListHeaderComponent={
          <View>
            {shareRow}
            {previewCard}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={renderPickItem}
        ListEmptyComponent={
          deferredQuery.trim() ? (
            <Text style={[styles.footNote, { color: colors.textMuted }]}>No matches</Text>
          ) : null
        }
        ListFooterComponent={
          hiddenCount > 0 ? (
            <Text style={[styles.footNote, { color: colors.textMuted }]}>
              {hiddenNote(hiddenCount)}
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

  const renderListItem = ({ item }: { item: InviteContact }) => (
    <InviteRow
      item={item}
      invitedAt={invited[item.id] ?? null}
      smsAvailable={smsAvailable}
      region={region}
      onSend={handleSend}
      avatarBg={colors.surfaceElevated}
      textColor={colors.text}
      mutedColor={colors.textMuted}
    />
  );

  const renderList = () => (
    <FlatList
      data={selectedContacts}
      extraData={invited}
      keyExtractor={(item) => item.id}
      initialNumToRender={20}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: bottomPad }}
      ListHeaderComponent={
        <View>
          {shareRow}
          {previewCard}
          {access === 'all' ? (
            <Pressable onPress={handleEditSelection} hitSlop={8} style={styles.editLink}>
              <Text style={[styles.editLinkText, { color: COLORS.primary }]}>Edit selection</Text>
            </Pressable>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        access === 'limited' ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.deniedText, { color: colors.text }]}>
              No contacts shared with TribeLife yet
            </Text>
            <PillButton
              title="Select contacts"
              onPress={handleSelectMore}
              variant="primary"
              style={{ marginTop: SPACING.md }}
            />
          </View>
        ) : (
          <Text style={[styles.footNote, { color: colors.textMuted }]}>
            No contacts with a phone number to invite.
          </Text>
        )
      }
      ListFooterComponent={
        <View>
          {access === 'limited' && selectedContacts.length > 0 ? (
            <Pressable onPress={handleSelectMore} hitSlop={8} style={styles.editLink}>
              <Text style={[styles.editLinkText, { color: COLORS.primary }]}>Select more contacts</Text>
            </Pressable>
          ) : null}
          {hiddenCount > 0 ? (
            <Text style={[styles.footNote, { color: colors.textMuted }]}>
              {hiddenNote(hiddenCount)}
            </Text>
          ) : null}
        </View>
      }
      renderItem={renderListItem}
    />
  );

  let body: React.ReactNode = null;
  if (step === 'intro') body = renderIntro();
  else if (step === 'boot') {
    body = (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  } else if (step === 'loading') {
    body = (
      <View style={styles.flex}>
        {shareRow}
        <View style={styles.centerWrap}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </View>
    );
  } else if (step === 'denied') body = renderDenied();
  else if (step === 'error') body = renderError();
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
      <ActionSheetModal
        visible={chooser !== null}
        onClose={() => setChooser(null)}
        title="Choose a number"
        actions={chooserActions}
      />
    </SafeAreaView>
  );
}

// ── Share row + message preview ──────────────────────────────────────────────
function ShareRow({
  onWhatsApp,
  onLinkedIn,
  onMore,
  borderColor,
  textColor,
}: {
  onWhatsApp: () => void;
  onLinkedIn: () => void;
  onMore: () => void;
  borderColor: string;
  textColor: string;
}) {
  const items = [
    { label: 'WhatsApp', onPress: onWhatsApp },
    { label: 'LinkedIn', onPress: onLinkedIn },
    { label: 'More', onPress: onMore },
  ];
  return (
    <View style={styles.shareRow}>
      {items.map((item) => (
        <Pressable
          key={item.label}
          onPress={item.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.shareButton, { borderColor, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.shareButtonText, { color: textColor }]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PreviewCard({
  text,
  cardColor,
  textColor,
  mutedColor,
}: {
  text: string;
  cardColor: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={[styles.previewCard, { backgroundColor: cardColor }]}>
      <Text style={[styles.previewTitle, { color: mutedColor }]}>Message preview</Text>
      <Text style={[styles.previewText, { color: textColor }]}>{text}</Text>
      <Text style={[styles.previewNote, { color: mutedColor }]}>
        Each friend gets their own message. Nothing is sent until you tap Send in Messages or WhatsApp.
      </Text>
    </View>
  );
}

// ── Row pieces ───────────────────────────────────────────────────────────────
const PickRow = memo(function PickRow({
  item,
  checked,
  region,
  onToggle,
  borderColor,
  avatarBg,
  textColor,
  mutedColor,
}: {
  item: InviteContact;
  checked: boolean;
  region: string | null;
  onToggle: (id: string) => void;
  borderColor: string;
  avatarBg: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <Pressable
      onPress={() => onToggle(item.id)}
      style={({ pressed }) => [styles.pickRow, { opacity: pressed ? 0.8 : 1 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? COLORS.primary : borderColor,
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
      <Avatar name={item.name} bg={avatarBg} fg={textColor} />
      <View style={styles.rowText}>
        <Text
          style={[styles.rowName, { color: textColor }, isRTLText(item.name) && styles.rtl]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={[styles.rowPhone, { color: mutedColor }]} numberOfLines={1}>
          {intlPhone(item.phones[0], region)?.display ?? item.phones[0]}
        </Text>
      </View>
    </Pressable>
  );
});

const InviteRow = memo(function InviteRow({
  item,
  invitedAt,
  smsAvailable,
  region,
  onSend,
  avatarBg,
  textColor,
  mutedColor,
}: {
  item: InviteContact;
  invitedAt: string | null;
  smsAvailable: boolean;
  region: string | null;
  onSend: (contact: InviteContact, channel: Channel) => void;
  avatarBg: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={styles.listRow}>
      <Avatar name={item.name} bg={avatarBg} fg={textColor} />
      <View style={styles.rowText}>
        <Text
          style={[styles.rowName, { color: textColor }, isRTLText(item.name) && styles.rtl]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={[styles.rowPhone, { color: mutedColor }]} numberOfLines={1}>
          {intlPhone(item.phones[0], region)?.display ?? item.phones[0]}
        </Text>
        {invitedAt ? (
          <Text style={[styles.invitedText, { color: COLORS.primary }]}>{invitedLabel(invitedAt)}</Text>
        ) : null}
      </View>
      <View style={styles.rowButtons}>
        {smsAvailable ? (
          <RowButton label="Text" color={COLORS.primary} onPress={() => onSend(item, 'text')} />
        ) : null}
        <RowButton label="WhatsApp" color={COLORS.primary} onPress={() => onSend(item, 'whatsapp')} />
      </View>
    </View>
  );
});

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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: SPACING.page,
    marginBottom: SPACING.sm,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.xl,
  },
  deniedWrap: {
    alignItems: 'center',
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.xl,
  },
  shareRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  shareButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: RADIUS.pill,
    paddingVertical: 10,
  },
  shareButtonText: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  previewCard: {
    marginHorizontal: SPACING.page,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  previewTitle: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.regular,
  },
  previewNote: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: FONTS.regular,
    marginTop: 8,
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
  rowButtons: {
    gap: 6,
    alignItems: 'stretch',
  },
  rowButton: {
    alignItems: 'center',
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
