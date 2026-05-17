import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { FONTS, SPACING } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { ChevraDailyBanner } from './ChevraDailyBanner';
import { ChevraContentTile } from './ChevraContentTile';
import { ChevraWideTile } from './ChevraWideTile';
import { getShabbatInfo, getDafYomi, getRabbiNote } from './dailyContent';

const SHABBAT_ACCENT = '#E5A23A';
const DAF_ACCENT = '#8C7AD9';
const RABBI_ACCENT = '#F59E0B';

function CandleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3c1 1.5 1 3 0 4-1-1-1-2.5 0-4z" fill={SHABBAT_ACCENT} />
      <Path
        d="M10 9h4v11a2 2 0 01-2 2 2 2 0 01-2-2V9z"
        stroke={SHABBAT_ACCENT}
        strokeWidth={1.5}
      />
      <Path
        d="M9 8h6"
        stroke={SHABBAT_ACCENT}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function BookIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5z"
        stroke={DAF_ACCENT}
        strokeWidth={1.5}
      />
      <Path
        d="M8 7h8M8 11h8M8 15h5"
        stroke={DAF_ACCENT}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ScrollIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 4h10a2 2 0 012 2v14M6 4a2 2 0 00-2 2v12a2 2 0 002 2h10"
        stroke={RABBI_ACCENT}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Circle cx={18} cy={20} r={2} stroke={RABBI_ACCENT} strokeWidth={1.5} />
    </Svg>
  );
}

export function ChevraTodaySection() {
  const { colors } = useTheme();
  const screenW = Dimensions.get('window').width;
  const tileGap = 12;
  const pairWidth = (screenW - SPACING.page * 2 - tileGap) / 2;

  const shabbat = getShabbatInfo();
  const daf = getDafYomi();
  const rabbi = getRabbiNote();

  const shabbatLabel =
    shabbat.daysUntil === 0
      ? 'Tonight'
      : `In ${shabbat.daysUntil} day${shabbat.daysUntil === 1 ? '' : 's'}`;

  return (
    <View style={styles.container}>
      <ChevraDailyBanner />

      <View style={styles.tilePair}>
        <ChevraContentTile
          width={pairWidth}
          eyebrow={`Shabbat · ${shabbatLabel}`}
          primary={shabbat.candleLightingTime}
          secondary={`Candle lighting · ${shabbat.region}`}
          glyph={<CandleIcon />}
          accent={SHABBAT_ACCENT}
        />
        <ChevraContentTile
          width={pairWidth}
          eyebrow="Daf Yomi"
          primary={daf.englishName}
          secondary={`Today's page · ${daf.tractate}`}
          glyph={<BookIcon />}
          accent={DAF_ACCENT}
        />
      </View>

      <ChevraWideTile
        eyebrow="From the Rabbi"
        title={rabbi.title}
        body={rabbi.preview}
        footer={`— ${rabbi.author}`}
        glyph={<ScrollIcon />}
        accent={RABBI_ACCENT}
      />

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Communities
        </Text>
        <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
          Find your people
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  tilePair: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    letterSpacing: 0.2,
  },
  sectionSub: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    marginTop: 2,
  },
});
