import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// "Illuminated Devotional" — warm parchment, liturgical garnet + manuscript gold.
class AppColors {
  final Color canvas, surface, surface2, line, ink, inkSoft, inkFaint;
  final Color brand, brandSoft, brandInk, gold, goldSoft, highlight, good, warn, ember;
  const AppColors({
    required this.canvas,
    required this.surface,
    required this.surface2,
    required this.line,
    required this.ink,
    required this.inkSoft,
    required this.inkFaint,
    required this.brand,
    required this.brandSoft,
    required this.brandInk,
    required this.gold,
    required this.goldSoft,
    required this.highlight,
    required this.good,
    required this.warn,
    required this.ember,
  });

  static const light = AppColors(
    canvas: Color(0xFFF4EDE0),
    surface: Color(0xFFFFFDF8),
    surface2: Color(0xFFECE2CF),
    line: Color(0xFFE0D4BD),
    ink: Color(0xFF2A2018),
    inkSoft: Color(0xFF6A5B49),
    inkFaint: Color(0xFF9C8A72),
    brand: Color(0xFF97233A),
    brandSoft: Color(0xFFF3E2DD),
    brandInk: Color(0xFFFFFAF4),
    gold: Color(0xFFB9892F),
    goldSoft: Color(0xFFF6E7BF),
    highlight: Color(0xFFF7E3A1),
    good: Color(0xFF4F7A3F),
    warn: Color(0xFFC4781F),
    ember: Color(0xFFD2691E),
  );

  static const dark = AppColors(
    canvas: Color(0xFF161009),
    surface: Color(0xFF211910),
    surface2: Color(0xFF2C2114),
    line: Color(0xFF3A2C1B),
    ink: Color(0xFFF1E7D6),
    inkSoft: Color(0xFFC3B29A),
    inkFaint: Color(0xFF8C7A62),
    brand: Color(0xFFE07189),
    brandSoft: Color(0xFF3A1F23),
    brandInk: Color(0xFF1A0D10),
    gold: Color(0xFFE0B85F),
    goldSoft: Color(0xFF3A2F17),
    highlight: Color(0xFF5C4A1C),
    good: Color(0xFF8FB070),
    warn: Color(0xFFD99A4A),
    ember: Color(0xFFE08A3E),
  );
}

/// Read the active palette from context.
AppColors colorsOf(BuildContext c) =>
    Theme.of(c).brightness == Brightness.dark ? AppColors.dark : AppColors.light;

/// Display serif (headings, numerals) — Fraunces.
TextStyle display(BuildContext c, {double? size, FontWeight? weight, Color? color, bool italic = false}) =>
    GoogleFonts.fraunces(
      fontSize: size,
      fontWeight: weight ?? FontWeight.w700,
      color: color ?? colorsOf(c).ink,
      fontStyle: italic ? FontStyle.italic : FontStyle.normal,
    );

/// Amharic scripture serif — Noto Serif Ethiopic.
TextStyle amharic(BuildContext c, {double? size, FontWeight? weight, Color? color, double? height}) =>
    GoogleFonts.notoSerifEthiopic(
      fontSize: size,
      fontWeight: weight,
      color: color ?? colorsOf(c).ink,
      height: height,
    );

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? AppColors.dark : AppColors.light;
  final base = ThemeData(brightness: brightness, useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: c.canvas,
    colorScheme: ColorScheme.fromSeed(
      seedColor: c.brand,
      brightness: brightness,
      surface: c.surface,
    ),
    textTheme: GoogleFonts.hankenGroteskTextTheme(base.textTheme).apply(
      bodyColor: c.ink,
      displayColor: c.ink,
    ),
    dividerColor: c.line,
  );
}
