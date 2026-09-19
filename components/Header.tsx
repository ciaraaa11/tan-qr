import { Image, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

type Props = { title: string };

export default function Header({ title }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },

  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },

  logo: {
    width: 44,
    height: 44,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});